import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

// Where an admin who has entered a valid password still is on the way to a
// full session. null = nothing pending (signed out, or fully signed in).
export type MfaState =
  | { kind: 'verify'; factorId: string }  // has an authenticator: ask for the code
  | { kind: 'enroll' }                    // none yet: must set one up first
  | null;

interface AuthContextType {
  // A signed-in ADMIN with a completed second factor (AAL2). Never set for a
  // password-only session — see AuthContext.tsx.
  user: User | null;
  loading: boolean;
  mfa: MfaState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Call after a successful MFA verification to finish signing in.
  completeMfa: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
