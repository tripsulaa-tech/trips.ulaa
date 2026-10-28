import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import type { MfaState } from '../context/useAuth';
import Button from '../components/ui/Button';
import { WarningCircle as AlertCircle } from '@phosphor-icons/react';

// Second step of the admin login: asks for the 6-digit code from an
// authenticator app, or (first time only) shows a QR code to set one up.

type Props = { mfa: NonNullable<MfaState> };

const inputClass =
  'w-full px-4 py-3 rounded-md border-2 border-background-warm bg-background font-body text-dark text-center text-2xl tracking-[0.4em] placeholder-dark-muted/75 transition-all duration-200 outline-none focus:border-primary focus:bg-white';

export default function AdminMfaStep({ mfa }: Props) {
  const { signOut, completeMfa } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Enrolment details (only used when mfa.kind === 'enroll').
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [setupError, setSetupError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (mfa.kind !== 'enroll' || started.current) return;
    started.current = true;
    (async () => {
      // A half-finished earlier attempt leaves an unverified factor behind,
      // which would block enrolling again — clear those first.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      // Include the email so several admin accounts can be told apart in the
      // authenticator app.
      const { data: userData } = await supabase.auth.getUser();
      const label = userData?.user?.email ? `Ulaa Admin (${userData.user.email})` : 'Ulaa Admin';
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: label,
        issuer: 'Ulaa Admin',
      });
      if (enrolError || !data) {
        setSetupError('Could not start two-factor setup. Refresh the page and try again.');
        return;
      }
      setEnrol({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [mfa.kind]);

  const factorId = mfa.kind === 'verify' ? mfa.factorId : enrol?.factorId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    try {
      setLoading(true);
      setError('');
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (verifyError) throw verifyError;
      await completeMfa();
    } catch (err) {
      console.error('MFA verify failed:', err);
      const e = err as { code?: string; status?: number; message?: string };
      if (e.code === 'over_request_rate_limit' || e.status === 429) {
        setError('Too many attempts. Wait a minute and try again.');
      } else if (e.code === 'mfa_verification_failed') {
        setError('That code is not correct, or it has expired. Check your authenticator app and try again.');
      } else {
        setError(`Verification failed: ${e.message ?? 'unknown error'}`);
      }
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try { await signOut(); } catch { /* the session is dropped on reload anyway */ }
  };

  return (
    <div className="bg-white rounded-lg shadow-warm-lg p-8">
      <h2 className="font-display text-xl font-bold text-dark text-center">
        {mfa.kind === 'enroll' ? 'Set up two-factor sign-in' : 'Two-factor verification'}
      </h2>

      {mfa.kind === 'enroll' ? (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-dark-muted text-center">
            Admin accounts need an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
            Scan this code with the app, then enter the 6-digit code it shows.
          </p>
          {setupError && (
            <div role="alert" className="flex items-center gap-2 text-danger-fg bg-danger-bg rounded-md p-3">
              <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
              <p className="text-sm">{setupError}</p>
            </div>
          )}
          {enrol && (
            <div className="flex flex-col items-center gap-2">
              <img src={enrol.qr} alt="QR code to add Ulaa Admin to your authenticator app" className="w-44 h-44 rounded-md border border-background-warm bg-white p-1" />
              <p className="text-xs text-dark-muted text-center">Can't scan? Enter this key in the app instead:</p>
              <code className="text-xs break-all text-center select-all bg-background rounded px-2 py-1">{enrol.secret}</code>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-dark-muted text-center">
          Enter the 6-digit code from your authenticator app.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label htmlFor="admin-mfa-code" className="sr-only">6-digit code</label>
          <input
            id="admin-mfa-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
            placeholder="000000"
            className={inputClass}
            aria-invalid={!!error}
            aria-describedby={error ? 'admin-mfa-error' : undefined}
          />
        </div>

        {error && (
          <div id="admin-mfa-error" role="alert" className="flex items-center gap-2 text-danger-fg bg-danger-bg rounded-md p-3">
            <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={!factorId || code.length !== 6}>
          {mfa.kind === 'enroll' ? 'Turn on and sign in' : 'Verify'}
        </Button>
      </form>

      <button type="button" onClick={handleSignOut} className="mt-4 w-full text-center text-sm text-dark-muted hover:text-dark underline underline-offset-2">
        Sign in with a different account
      </button>
    </div>
  );
}
