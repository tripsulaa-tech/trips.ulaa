import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import Button from '../components/ui/Button';
import { COMMON_EMAIL_DOMAINS } from '../constants/emailDomains';
import {
  WarningCircle as AlertCircle,
} from '@phosphor-icons/react';

// How many rows to show at once in the email-domain suggestion dropdown.
const MAX_EMAIL_SUGGESTIONS = 6;

export default function AdminLogin() {
  const { signIn } = useAuth();
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

    const atIndex = value.indexOf('@');
    if (atIndex === -1) {
      setEmailSuggestionsOpen(false);
      return;
    }
    const localPart = value.slice(0, atIndex);
    const domainPart = value.slice(atIndex + 1).toLowerCase();
    if (!localPart) {
      setEmailSuggestionsOpen(false);
      return;
    }
    // Already a complete, exact match (typed or pasted in full) — nothing
    // left to suggest.
    if (COMMON_EMAIL_DOMAINS.includes(domainPart)) {
      setEmailSuggestionsOpen(false);
      return;
    }
    const matches = (domainPart === ''
      ? COMMON_EMAIL_DOMAINS
      : COMMON_EMAIL_DOMAINS.filter(d => d.startsWith(domainPart))
    ).slice(0, MAX_EMAIL_SUGGESTIONS);
    setEmailSuggestions(matches.map(d => `${localPart}@${d}`));
    setEmailSuggestionIndex(-1);
    setEmailSuggestionsOpen(matches.length > 0);
  };

  const selectEmailSuggestion = (suggestion: string) => {
    setEmail(suggestion);
    setEmailSuggestionsOpen(false);
    setEmailSuggestionIndex(-1);
  };

  // Down/Up move a highlighted row (wrapping at either end), Enter picks
  // whichever row is highlighted, and Escape dismisses the list without
  // changing the field. A no-op whenever the dropdown isn't open, so it
  // never interferes with normal typing or submitting the form.
  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!emailSuggestionsOpen || emailSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setEmailSuggestionIndex((emailSuggestionIndex + 1) % emailSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEmailSuggestionIndex(emailSuggestionIndex <= 0 ? emailSuggestions.length - 1 : emailSuggestionIndex - 1);
    } else if (e.key === 'Enter') {
      if (emailSuggestionIndex >= 0) {
        e.preventDefault();
        selectEmailSuggestion(emailSuggestions[emailSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      setEmailSuggestionsOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await signIn(email, password);
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-md border-2 border-background-warm bg-background font-body text-dark placeholder-dark-muted/50 transition-all duration-200 outline-none focus:border-primary focus:bg-white`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src="/ULAA-logo.png" alt="ULAA" className="h-28 mx-auto mb-4" />
          <h1 className="font-display text-3xl font-bold text-dark">Admin Panel</h1>
          <p className="text-dark-muted text-sm mt-1">Sign in to manage ULAA trips and enquiries.</p>
        </div>

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
                <ul
                  role="listbox"
                  className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto app-scroll rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1"
                >
                  {emailSuggestions.map((suggestion, idx) => (
                    <li key={suggestion} role="option" aria-selected={idx === emailSuggestionIndex}>
                      <button
                        type="button"
                        // onMouseDown (not onClick) fires before the input's
                        // onBlur, and preventDefault stops that blur from
                        // firing at all — so picking a suggestion never
                        // races with the dropdown closing itself out from
                        // under the click.
                        onMouseDown={e => { e.preventDefault(); selectEmailSuggestion(suggestion); }}
                        className={`w-full px-4 py-2 text-sm text-left font-body text-dark transition-colors ${idx === emailSuggestionIndex ? 'bg-background-warm' : 'hover:bg-background-warm'}`}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
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
              <div id="admin-login-error" role="alert" className="flex items-center gap-2 text-red-600 bg-red-50 rounded-md p-3">
                <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
