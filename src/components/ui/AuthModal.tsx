import { useEffect, useState } from 'react';
import { WarningCircle as AlertCircle, CheckCircle } from '@phosphor-icons/react';
import Modal from './Modal';
import Button from './Button';
import { useAuth } from '../../context/useAuth';
import { classifyAuthError } from '../../utils/authErrors';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';
type Message = { type: 'error' | 'success'; text: string };

const MIN_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

const inputClass = 'w-full px-4 py-3 rounded-md border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/50 transition-all duration-200 outline-none focus:border-primary focus:bg-white';

const TITLES: Record<Mode, string> = {
  signin: 'Welcome back',
  signup: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
};

const SUBTITLES: Record<Mode, string> = {
  signin: 'Sign in to your Ulaa account.',
  signup: 'Use the email you enquired with — your details will be filled in for you next time.',
  forgot: "Enter your account email and we'll send you a link to set a new password.",
  reset: 'Pick a new password for your account.',
};

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Shown when the modal opens (e.g. an expired email link). */
  initialMessage?: Message | null;
}

/** Sign in / create account / forgot / reset-password popup for customers.
 *  Accounts exist only for emails that have sent an enquiry (enforced in the database). */
export default function AuthModal({ isOpen, onClose, initialMessage }: AuthModalProps) {
  const { signIn, signUp, resendConfirmation, resetPassword, updatePassword, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [chosenMode, setChosenMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  // undefined = untouched, so the parent's initialMessage is shown; null = cleared.
  const [messageState, setMessage] = useState<Message | null | undefined>(undefined);
  const message = messageState === undefined ? (initialMessage ?? null) : messageState;
  // Set when sign-in failed only because the email isn't confirmed yet.
  const [canResend, setCanResend] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Arriving through a password-reset link always lands on the "new password" form.
  const mode: Mode = passwordRecovery ? 'reset' : chosenMode;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resetFields = () => {
    setMessage(null);
    setCanResend(false);
    setPassword('');
    setConfirm('');
  };

  const switchMode = (next: Mode) => {
    setChosenMode(next);
    resetFields();
  };

  const handleClose = () => {
    if (passwordRecovery) clearPasswordRecovery();
    onClose();
    resetFields();
    setMessage(undefined);
    setChosenMode('signin');
  };

  const passwordProblem = (): string | null => {
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setCanResend(false);
    const cleanEmail = email.trim();

    if (mode === 'signup' || mode === 'reset') {
      const problem = passwordProblem();
      if (problem) {
        setMessage({ type: 'error', text: problem });
        return;
      }
    }

    try {
      setBusy(true);
      if (mode === 'signin') {
        await signIn(cleanEmail, password);
        handleClose();
      } else if (mode === 'signup') {
        const { needsConfirmation, alreadyRegistered } = await signUp(cleanEmail, password);
        if (alreadyRegistered) {
          setMessage({ type: 'error', text: 'An account with this email already exists. Sign in instead, or reset your password if you have forgotten it.' });
        } else if (needsConfirmation) {
          setMessage({ type: 'success', text: "Almost there! We've sent a confirmation link to your email. Open it to finish creating your account." });
          setCooldown(RESEND_COOLDOWN_SECONDS);
        } else {
          handleClose();
        }
      } else if (mode === 'forgot') {
        await resetPassword(cleanEmail);
        // Same wording whether or not an account exists.
        setMessage({ type: 'success', text: "If an account exists for that email, we've sent a link to reset your password." });
      } else {
        await updatePassword(password);
        handleClose();
      }
    } catch (err) {
      const kind = classifyAuthError(err, mode === 'signup' ? 'signup' : mode === 'signin' ? 'signin' : 'other');
      switch (kind) {
        case 'not_confirmed':
          setCanResend(true);
          setMessage({ type: 'error', text: 'Please confirm your email first — open the link we sent you. Lost it? Resend it below.' });
          break;
        case 'no_enquiry':
          setMessage({ type: 'error', text: "We couldn't create an account with that email. Please use the same email you used when you sent your enquiry." });
          break;
        case 'rate_limited':
          setMessage({ type: 'error', text: 'Too many attempts. Please wait a few minutes and try again.' });
          break;
        case 'weak_password':
          setMessage({ type: 'error', text: 'That password is too weak. Try a longer one with a mix of letters and numbers.' });
          break;
        case 'same_password':
          setMessage({ type: 'error', text: 'Your new password must be different from the old one.' });
          break;
        case 'invalid_email':
          setMessage({ type: 'error', text: 'Please enter a valid email address.' });
          break;
        case 'invalid_credentials':
          setMessage({ type: 'error', text: 'Invalid email or password. Please try again.' });
          break;
        default:
          setMessage({
            type: 'error',
            text: mode === 'signin' ? 'Could not sign you in. Please try again.' : 'Something went wrong. Please try again.',
          });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    try {
      setBusy(true);
      await resendConfirmation(email.trim());
      setCanResend(false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage({ type: 'success', text: 'Confirmation email sent again. Check your inbox (and spam folder).' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: classifyAuthError(err) === 'rate_limited'
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : 'Could not resend the email. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const showEmail = mode !== 'reset';
  const showPassword = mode !== 'forgot';
  const showConfirm = mode === 'signup' || mode === 'reset';
  const submitLabel = { signin: 'Sign In', signup: 'Create Account', forgot: 'Send reset link', reset: 'Save new password' }[mode];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm" title={TITLES[mode]}>
      <p className="text-dark-muted text-sm mb-5">{SUBTITLES[mode]}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {showEmail && (
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className={inputClass}
              autoComplete="email"
            />
          </div>
        )}
        {showPassword && (
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label htmlFor="auth-password" className="block text-sm font-medium text-dark">
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              {mode === 'signin' && (
                <button type="button" onClick={() => switchMode('forgot')} className="text-xs text-primary font-semibold hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className={inputClass}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
        )}
        {showConfirm && (
          <div>
            <label htmlFor="auth-confirm" className="block text-sm font-medium text-dark mb-1">Confirm password</label>
            <input
              id="auth-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className={inputClass}
              autoComplete="new-password"
            />
          </div>
        )}

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-md p-3 ${message.type === 'error' ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50'}`}
          >
            {message.type === 'error'
              ? <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              : <CheckCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />}
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {submitLabel}
        </Button>
      </form>

      {(canResend || (mode === 'signup' && message?.type === 'success')) && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || cooldown > 0}
            className="text-sm text-primary font-semibold hover:underline disabled:opacity-60 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend confirmation email (${cooldown}s)` : 'Resend confirmation email'}
          </button>
        </div>
      )}

      {mode !== 'reset' && (
        <p className="text-sm text-dark-muted text-center mt-5">
          {mode === 'signin' && (
            <>Sent an enquiry already?{' '}
              <button type="button" onClick={() => switchMode('signup')} className="text-primary font-semibold hover:underline">Create an account</button>
            </>
          )}
          {mode === 'signup' && (
            <>Already have an account?{' '}
              <button type="button" onClick={() => switchMode('signin')} className="text-primary font-semibold hover:underline">Sign in</button>
            </>
          )}
          {mode === 'forgot' && (
            <button type="button" onClick={() => switchMode('signin')} className="text-primary font-semibold hover:underline">Back to sign in</button>
          )}
        </p>
      )}
    </Modal>
  );
}
