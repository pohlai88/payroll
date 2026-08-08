/**
 * `AuthContext` — the signed-in user (from `GET /v1/me`, including
 * `companies[]`) plus sign-out. Lifted out of the single-screen shell in
 * `App.tsx` so routed screens can read identity without prop-drilling.
 *
 * This context does not own the session-loading state machine that guards
 * sign-in — that flow (checking for a Neon Auth session, showing a sign-in
 * form) still lives in `App.tsx` / `web/auth/client.ts`. `AuthProvider` is
 * mounted once a session is known to exist, and simply fetches `/v1/me`.
 */

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MeResponse } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { signOutAuth } from "@/web/auth/client";

interface AuthContextValue {
  me: MeResponse | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    payrollApi
      .getMe()
      .then((result) => {
        if (!cancelled) {
          setMe(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    setMe(null);
    // Neon Auth owns the session cookie/token — there is no local access
    // token to clear here (see `web/auth/client.ts`).
    signOutAuth().catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ me, loading, signOut }),
    [me, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}

export type { AuthContextValue };
export { AuthProvider, useAuthContext };
