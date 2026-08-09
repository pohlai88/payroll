/**
 * App root — Neon Auth session guard, then the routed product shell.
 *
 * The session-loading state machine (checking for a session, showing the
 * sign-in form) stays outside `AuthProvider`, same as the Phase 4A shell it
 * replaces: `AuthProvider` only mounts once a session is known to exist.
 * Everything below "signed in" is the Phase 5B shell — see
 * `docs/superpowers/specs/2026-08-08-phase5b-payroll-ui-shell-workspace-design.md`.
 */

import {
  type ChangeEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Redirect, Route, Switch } from "wouter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminPage } from "@/web/admin/admin-page";
import { formatApiError } from "@/web/api/format-error";
import { getAuthSession, signInWithEmail } from "@/web/auth/client";
import { AuthProvider } from "@/web/context/auth-context";
import { ScopeProvider } from "@/web/context/scope-context";
import { ControlPage } from "@/web/control/control-page";
import { EmployeesPage } from "@/web/employees/employees-page";
import { PayRunListPage } from "@/web/payrun/pay-run-list";
import { PayslipPage } from "@/web/payrun/payslip-page";
import { WorkspacePage } from "@/web/payrun/workspace";
import { ReportsPage } from "@/web/reports/reports-page";
import { ShellLayout } from "@/web/shell/layout";

type Screen = "loading" | "signed_out" | "signed_in";

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getAuthSession();
        if (!cancelled) {
          setScreen(session === null ? "signed_out" : "signed_in");
        }
      } catch {
        if (!cancelled) {
          setScreen("signed_out");
        }
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const onSignIn = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBusy(true);
      setSignInError(null);
      try {
        await signInWithEmail(email.trim(), password);
        setPassword("");
        setScreen("signed_in");
      } catch (cause) {
        setSignInError(formatApiError(cause));
        setScreen("signed_out");
      } finally {
        setBusy(false);
      }
    },
    [email, password]
  );

  const onEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.currentTarget.value);
  }, []);

  const onPasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPassword(event.currentTarget.value);
    },
    []
  );

  if (screen === "loading") {
    return (
      <main className="container mx-auto space-y-4 p-4">
        <h1 className="font-bold text-2xl">Clarity Payroll</h1>
        <Alert>
          <AlertTitle>ⓘ Checking session…</AlertTitle>
        </Alert>
      </main>
    );
  }

  if (screen === "signed_out") {
    return (
      <main className="container mx-auto space-y-4 p-4">
        <h1 className="font-bold text-2xl">Clarity Payroll</h1>
        {signInError === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>⚠ {signInError}</AlertTitle>
          </Alert>
        )}
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSignIn}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  autoComplete="username"
                  disabled={busy}
                  id="email"
                  onChange={onEmailChange}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  autoComplete="current-password"
                  disabled={busy}
                  id="password"
                  onChange={onPasswordChange}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <Button className="w-full" disabled={busy} type="submit">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <AuthProvider>
      <ScopeProvider>
        <ShellLayout>
          <Switch>
            <Route path="/">
              <Redirect to="/pay-runs" />
            </Route>
            <Route component={PayRunListPage} path="/pay-runs" />
            <Route
              component={PayslipPage}
              path="/pay-runs/:runId/payslip/:lineId"
            />
            <Route component={WorkspacePage} path="/pay-runs/:runId" />
            <Route component={EmployeesPage} path="/employees" />
            <Route component={ReportsPage} path="/reports" />
            <Route component={ControlPage} path="/control" />
            <Route component={AdminPage} path="/admin" />
            <Route>
              <main className="p-6 text-muted-foreground text-sm">
                Not found.
              </main>
            </Route>
          </Switch>
        </ShellLayout>
      </ScopeProvider>
    </AuthProvider>
  );
}
