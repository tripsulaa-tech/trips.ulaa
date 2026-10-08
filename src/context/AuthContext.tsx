import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import type { User } from '@supabase/supabase-js';
import { AuthContext } from './useAuth';
import { useToast } from '../components/ui/useToast';
import { getAuthRedirectInfo } from '../utils/authErrors';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const toast = useToast();

  // Opened from an email link? A broken one (expired / already used) is
  // explained in the sign-in popup; a good signup-confirmation link gets a
  // welcome toast as soon as the session is ready.
  const [authNotice, setAuthNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(() =>
    getAuthRedirectInfo().linkError
      ? {
          type: 'error',
          text: 'That email link has expired or was already used. Sign in below — if your email is not confirmed yet, you can resend the link.',
        }
      : null,
  );
  const confirmedSignupRef = useRef(getAuthRedirectInfo().confirmedSignup);
  // Tracked per user id so a stale answer for a previous user is never applied.
  const [adminState, setAdminState] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && confirmedSignupRef.current) {
      confirmedSignupRef.current = false;
      toast.success("Email confirmed — you're signed in. Welcome to Ulaa!");
    }
  }, [user, toast]);

  // Signed in no longer means "admin": registered customers have accounts too.
  // Ask the database (public.is_admin(), the same check every RLS policy uses).
  // This only gates the UI; RLS is what actually protects the data.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return;
      setAdminState({ userId, isAdmin: !error && data === true });
    });
    return () => { cancelled = true; };
  }, [userId]);

  const adminResolved = !userId || adminState?.userId === userId;
  const isAdmin = !!userId && adminState?.userId === userId && adminState.isAdmin;
  const loading = sessionLoading || !adminResolved;

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    // With "Confirm email" on, signing up an address that already has an
    // account returns a fake success with no identities (and sends nothing).
    const alreadyRegistered = (data.user?.identities?.length ?? 1) === 0;
    return { needsConfirmation: !data.session && !alreadyRegistered, alreadyRegistered };
  };

  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecovery(false);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{
      user, isAdmin, loading, signIn, signUp, resendConfirmation, resetPassword, updatePassword,
      passwordRecovery, clearPasswordRecovery: () => setPasswordRecovery(false),
      authNotice, dismissAuthNotice: () => setAuthNotice(null), signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
