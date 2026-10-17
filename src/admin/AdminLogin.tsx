import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import { useBranding, brandingImgFallback } from '../hooks/useBranding';
import Button from '../components/ui/Button';
import AdminMfaStep from './AdminMfaStep';
import { getEmailDomainSuggestions } from '../constants/emailDomains';
import KeyboardNavSuggestionDropdown from '../components/ui/KeyboardNavSuggestionDropdown';
import { handleSuggestionKeyDown } from '../components/ui/suggestionKeyNav';
import {
  WarningCircle as AlertCircle,
} from '@phosphor-icons/react';

// How many rows to show at once in the email-domain suggestion dropdown.
const MAX_EMAIL_SUGGESTIONS = 6;

export default function AdminLogin() {
  const { urls: brand } = useBranding();
  const { signIn, mfa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Email-domain suggestions — once the admin's typed "@", offer the
  // common domains (Gmail first) that match whatever's typed after it,
  // so "admin@gm" can become "admin@gmail.com" in one tap/Enter instead
  // of typing the rest out. Purely a convenience for the domain half;
  // any domain can still be typed out in full.
  const [emailSuggestionsOpen, setEmailSuggestionsOpen] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [emailSuggestionIndex, setEmailSuggestionIndex] = useState(-1);

  const handleEmailInput = (value: string) => {
    setEmail(value);

    const matches = getEmailDomainSuggestions(value, MAX_EMAIL_SUGGESTIONS);
    setEmailSuggestions(matches);
    setEmailSuggestionIndex(-1);
    setEmailSuggestionsOpen(matches.length > 0);
  };

  const selectEmailSuggestion = (suggestion: string) => {
    setEmail(suggestion);
    setEmailSuggestionsOpen(false);
    setEmailSuggestionIndex(-1);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handleSuggestionKeyDown(e, emailSuggestions, emailSuggestionsOpen, emailSuggestionIndex, setEmailSuggestionIndex, selectEmailSuggestion, setEmailSuggestionsOpen);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await signIn(email, password);
    } catch (err) {
      console.error(err);
      // Only a genuine credentials failure should say "wrong password". If the
      // sign-in service itself is down, over quota (402) or unreachable, say so,
      // otherwise a correct password looks like it was rejected.
      const e = err as { status?: number; name?: string } | null;
      const status = typeof e?.status === 'number' ? e.status : undefined;
      if (status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (
        e?.name === 'AuthRetryableFetchError' ||
        status === 0 ||
        status === 402 ||
        (status !== undefined && status >= 500)
      ) {
        setError("Can't reach the sign-in service right now, so your password hasn't been checked. Please try again shortly.");
      } else {
        setError('Invalid email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-md border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/75 transition-all duration-200 outline-none focus:border-primary focus:bg-white`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={brand.admin_logo} onError={brandingImgFallback('admin_logo')} alt="Ulaa" className="h-28 mx-auto mb-4" />
          <h1 className="font-display text-3xl font-bold text-dark">Admin Panel</h1>
          <p className="text-dark-muted text-sm mt-1">Sign in to manage Ulaa trips and enquiries.</p>
        </div>

        {mfa ? <AdminMfaStep mfa={mfa} /> : (
        <div className="bg-white rounded-lg shadow-warm-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label htmlFor="admin-email" className="block text-sm font-medium text-dark mb-1">Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={e => handleEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onBlur={() => setEmailSuggestionsOpen(false)}
                required
                placeholder="admin@ulaa.travel"
                className={inputClass}
                autoComplete="email"
                aria-invalid={!!error}
              />
              {emailSuggestionsOpen && (
                <KeyboardNavSuggestionDropdown items={emailSuggestions} activeIndex={emailSuggestionIndex} onSelect={selectEmailSuggestion} />
              )}
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-dark mb-1">Password</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={inputClass}
                autoComplete="current-password"
                aria-invalid={!!error}
                aria-describedby={error ? 'admin-login-error' : undefined}
              />
            </div>

            {error && (
              <div id="admin-login-error" role="alert" className="flex items-center gap-2 text-danger-fg bg-danger-bg rounded-md p-3">
                <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>
        </div>
        )}
      </motion.div>
    </div>
  );
}
