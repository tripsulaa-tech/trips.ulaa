import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { AuthContext } from './useAuth';
import type { MfaState } from './useAuth';

// `user` means "a signed-in ADMIN who has completed two-factor (AAL2)", not
// just "someone with a Supabase session". Getting there takes three server
// confirmed steps:
//   1. the password is valid                               (Supabase Auth)
//   2. the account is on the admin allowlist               (is_admin_allowlisted)
//   3. a TOTP code was verified for this session (AAL2)    (Supabase MFA)
// Between 2 and 3 `user` stays null and `mfa` says which prompt to show, so
// the route guards in AppRouter (which only look at `user`) keep working.
// The database enforces the same rule independently: is_admin() requires an
// AAL2 token (see add_admin_mfa_step2_enforce.sql).

// null = couldn't tell (e.g. offline) — callers must not sign anyone out on it.
async function checkAllowlisted(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('is_admin_allowlisted');
  if (error) return null;
  return data === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mfa, setMfa] = useState<MfaState>(null);
  const [loading, setLoading] = useState(true);
  // Id of the user already confirmed as allowlisted, so token refreshes don't
  // repeat the server check.
  const allowlistedId = useRef<string | null>(null);
  const cancelled = useRef(false);

  const resolve = useCallback(async (session: Session | null) => {
    const finish = (u: User | null, m: MfaState) => {
      if (cancelled.current) return;
      setUser(u);
      setMfa(m);
      setLoading(false);
    };

    if (!session) {
      allowlistedId.current = null;
      finish(null, null);
      return;
    }

    if (allowlistedId.current !== session.user.id) {
      const ok = await checkAllowlisted();
      if (cancelled.current) return;
      if (ok === false) {
        // Definitely not an admin: drop the session.
        allowlistedId.current = null;
        void supabase.auth.signOut();
        finish(null, null);
        return;
      }
      if (ok === null) {
        finish(null, null); // unknown: keep the session, show the login screen
        return;
      }
      allowlistedId.current = session.user.id;
    }

    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (cancelled.current) return;
    if (error || !aal) {
      finish(null, null);
      return;
    }
    if (aal.currentLevel === 'aal2') {
      finish(session.user, null);
      return;
    }
    // Password-only session: needs a code (factor exists) or enrolment (none).
    if (aal.nextLevel === 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (cancelled.current) return;
      const factor = factors?.totp?.[0]; // verified TOTP factors only
      finish(null, factor ? { kind: 'verify', factorId: factor.id } : { kind: 'enroll' });
      return;
    }
    finish(null, { kind: 'enroll' });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    supabase.auth.getSession().then(({ data: { session } }) => resolve(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Deferred: supabase-js can deadlock if another supabase call is awaited
      // directly inside this callback.
      setTimeout(() => { void resolve(session); }, 0);
    });

    return () => {
      cancelled.current = true;
      subscription.unsubscribe();
    };
  }, [resolve]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Valid credentials are not enough — the account must be on the admin
    // allowlist. Fail like a wrong password so the login screen doesn't reveal
    // that some other (non-admin) account exists. The MFA prompt that follows
    // is driven by the auth-state listener above.
    const ok = await checkAllowlisted();
    if (ok !== true) {
      await supabase.auth.signOut();
      throw new Error('Invalid login credentials');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const completeMfa = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await resolve(session);
  };

  return (
    <AuthContext.Provider value={{ user, loading, mfa, signIn, signOut, completeMfa }}>
      {children}
    </AuthContext.Provider>
  );
}
