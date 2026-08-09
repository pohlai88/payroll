/**
 * @feature shell
 * @layer spine
 *
 * App root — Neon Auth session guard, then the routed product shell.
 * Per-route `<Route>` lines carry their own `@feature … @layer spine` banners.
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
import { Route, Switch } from "wouter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initDarkModeFromStorage } from "@/hooks/use-dark-mode";
import { AdminPage } from "@/web/admin/admin-page";
import { formatApiError } from "@/web/api/format-error";
import { getAuthSession, signInWithEmail } from "@/web/auth/client";
import { CompaniesPage } from "@/web/companies/companies-page";
import { AuthProvider } from "@/web/context/auth-context";
import { ScopeProvider } from "@/web/context/scope-context";
import { ControlPage } from "@/web/control/control-page";
import { DashboardPage } from "@/web/dashboard/dashboard-page";
import { EmployeesPage } from "@/web/employees/employees-page";
import { PayRunListPage } from "@/web/payrun/pay-run-list";
import { PayslipPage } from "@/web/payrun/payslip-page";
import { WorkspacePage } from "@/web/payrun/workspace";
import { ReportsPage } from "@/web/reports/reports-page";
import { ShellLayout } from "@/web/shell/layout";

initDarkModeFromStorage();

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

  const canDevLogin =
    import.meta.env.MODE === "development" &&
    (import.meta.env.VITE_DEV_EMAIL?.trim() ?? "").length > 0 &&
    (import.meta.env.VITE_DEV_PASSWORD ?? "").length >= 8;

  const onDevLogin = useCallback(async () => {
    const nextEmail = import.meta.env.VITE_DEV_EMAIL?.trim() ?? "";
    const nextPassword = import.meta.env.VITE_DEV_PASSWORD ?? "";
    if (
      import.meta.env.MODE !== "development" ||
      nextEmail.length === 0 ||
      nextPassword.length < 8
    ) {
      setSignInError(
        "Developer Login needs VITE_DEV_EMAIL and VITE_DEV_PASSWORD (≥8 chars) in .env.local — run: npm run setup:dev-user -- --email … --name … --password …"
      );
      return;
    }
    setBusy(true);
    setSignInError(null);
    try {
      await signInWithEmail(nextEmail, nextPassword);
      setScreen("signed_in");
    } catch (cause) {
      setSignInError(formatApiError(cause));
      setScreen("signed_out");
    } finally {
      setBusy(false);
    }
  }, []);

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
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} type="submit">
                  Sign in
                </Button>
                {canDevLogin ? (
                  <Button
                    className="flex-1"
                    disabled={busy}
                    onClick={onDevLogin}
                    type="button"
                    variant="outline"
                  >
                    Developer Login
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <TooltipProvider>
      <AuthProvider>
        <ScopeProvider>
          <ShellLayout>
            <Switch>
              {/* --- @feature pay-run @layer spine --- */}
              <Route component={DashboardPage} path="/" />
              <Route component={PayRunListPage} path="/pay-runs" />
              {/* --- @feature payslip @layer spine --- */}
              <Route
                component={PayslipPage}
                path="/pay-runs/:runId/payslip/:lineId"
              />
              {/* --- @feature workspace @layer spine --- */}
              <Route component={WorkspacePage} path="/pay-runs/:runId" />
              {/* --- @feature employees @layer spine --- */}
              <Route component={EmployeesPage} path="/employees" />
              {/* --- @feature reports @layer spine --- */}
              <Route component={ReportsPage} path="/reports" />
              {/* --- @feature control @layer spine --- */}
              <Route component={ControlPage} path="/control" />
              {/* --- @feature companies @layer spine --- */}
              <Route component={CompaniesPage} path="/companies" />
              {/* --- @feature admin-users @layer spine --- */}
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
    </TooltipProvider>
  );
}
