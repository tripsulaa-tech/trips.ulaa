import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WarningCircle as AlertCircle, CheckCircle } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import { useAuth } from '../context/useAuth';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

type Mode = 'signin' | 'signup';

const MIN_PASSWORD_LENGTH = 8;

export default function AccountPage() {
  usePageMeta({
    title: pageTitle('My Account'),
    description: 'Sign in or create your Ulaa account using the email you enquired with.',
    path: '/account',
  });

  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }
    try {
      setBusy(true);
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) {
          setNotice('Almost there! We sent a confirmation link to your email. Open it to finish creating your account.');
        }
      }
    } catch {
      // Deliberately generic — doesn't reveal whether an email has an enquiry.
      setError(
        mode === 'signin'
          ? 'Invalid email or password. Please try again.'
          : "We couldn't create an account with that email. Please use the same email you used when you sent your enquiry.",
      );
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 rounded-md border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/50 transition-all duration-200 outline-none focus:border-primary focus:bg-white';

  return (
    <Layout>
      <section className="bg-background px-4 sm:px-6 lg:px-8 pt-32 pb-16 min-h-[70vh]">
        <div className="max-w-md mx-auto">
          {authLoading ? null : user ? (
            <div className="bg-white rounded-lg shadow-warm-lg p-8 text-center space-y-5">
              <h1 className="font-display text-3xl font-bold text-dark">My Account</h1>
              <p className="text-dark-muted text-sm break-all">Signed in as {user.email}</p>
              <Link to="/trips" className="block">
                <Button variant="primary" size="lg" fullWidth>Browse trips</Button>
              </Link>
              <Button variant="outline" size="lg" fullWidth onClick={() => { void signOut(); }}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-warm-lg p-8">
              <h1 className="font-display text-3xl font-bold text-dark text-center">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-dark-muted text-sm mt-1 mb-6 text-center">
                {mode === 'signin'
                  ? 'Sign in to your Ulaa account.'
                  : 'Use the email you enquired with — your details will be filled in for you next time.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="account-email" className="block text-sm font-medium text-dark mb-1">Email</label>
                  <input
                    id="account-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="account-password" className="block text-sm font-medium text-dark mb-1">Password</label>
                  <input
                    id="account-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className={inputClass}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                </div>
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="account-confirm" className="block text-sm font-medium text-dark mb-1">Confirm password</label>
                    <input
                      id="account-confirm"
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      className={inputClass}
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {error && (
                  <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-md p-3">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
                {notice && (
                  <div role="status" className="flex items-start gap-2 text-green-700 bg-green-50 rounded-md p-3">
                    <CheckCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm">{notice}</p>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              <p className="text-sm text-dark-muted text-center mt-6">
                {mode === 'signin' ? (
                  <>Sent an enquiry already?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-primary font-semibold hover:underline">Create an account</button>
                  </>
                ) : (
                  <>Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('signin')} className="text-primary font-semibold hover:underline">Sign in</button>
                  </>
                )}
              </p>
              {mode === 'signup' && (
                <p className="text-xs text-dark-muted text-center mt-3">
                  No enquiry yet? <Link to="/trips" className="text-primary font-semibold hover:underline">Pick a trip</Link> and book first.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
