import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  /** True only for accounts on the `admins` allowlist (public.is_admin()). */
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Customer sign-up. The database only allows emails that have an enquiry.
   * `needsConfirmation`: a confirmation email was sent. `alreadyRegistered`: that
   * email already has an account (Supabase hides this behind a fake success).
   */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean; alreadyRegistered: boolean }>;
  /** Re-sends the signup confirmation email. */
  resendConfirmation: (email: string) => Promise<void>;
  /** Sends a password-reset link. Always looks successful, so it never reveals whether an account exists. */
  resetPassword: (email: string) => Promise<void>;
  /** Sets a new password for the current (recovery-link) session. */
  updatePassword: (password: string) => Promise<void>;
  /** True while the user arrived through a password-reset link and still has to choose a new password. */
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  /** Set when the page was opened from a broken email link (expired / already used). */
  authNotice: { type: 'error' | 'success'; text: string } | null;
  dismissAuthNotice: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
