/**
 * Phase 4A auth-consuming shell — proves Neon Auth + Bearer API, not a product UI.
 */

import {
  type ChangeEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { payrollApi } from "@/web/api/payroll-api";
import {
  type AdminUserRow,
  ApiClientError,
  type MeResponse,
  type PermissionsResponse,
  SessionExpiredError,
} from "@/web/api/types";
import {
  getAuthSession,
  signInWithEmail,
  signOutAuth,
} from "@/web/auth/client";
import { isSystemAdminPresentation } from "@/web/auth/is-system-admin";
import { EmployeeImportPanel } from "@/web/employee-import-panel";

type Screen = "loading" | "signed_out" | "signed_in";

interface ShellState {
  me: MeResponse | null;
  permissions: PermissionsResponse | null;
  adminUsers: readonly AdminUserRow[] | null;
  companyId: string;
  error: string | null;
  info: string | null;
  importPanelKey: number;
}

const EMPTY_SHELL: ShellState = {
  me: null,
  permissions: null,
  adminUsers: null,
  companyId: "",
  error: null,
  info: null,
  importPanelKey: 0,
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const toggleTheme = useCallback(() => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  }, [dark]);

  return (
    <Button onClick={toggleTheme} type="button" variant="outline">
      {dark ? "Use light" : "Use dark"}
    </Button>
  );
}

// Status glyph mapping for badges
function getStatusGlyph(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "◦";
    case "inactive":
      return "◦";
    case "pending":
      return "⋯";
    case "disabled":
      return "⊘";
    case "expired":
      return "⊘";
    default:
      return "⊘";
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [shell, setShell] = useState<ShellState>(EMPTY_SHELL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const clearAuthDerivedState = useCallback(() => {
    setShell((previous) => ({
      ...EMPTY_SHELL,
      importPanelKey: previous.importPanelKey + 1,
    }));
  }, []);

  const loadServerState = useCallback(
    async (nextCompanyId: string) => {
      setBusy(true);
      try {
        const me = await payrollApi.getMe();
        const permissions = await payrollApi.getPermissions(
          nextCompanyId === "" ? null : nextCompanyId
        );
        let adminUsers: readonly AdminUserRow[] | null = null;
        if (isSystemAdminPresentation(permissions.permissions)) {
          const admin = await payrollApi.getAdminUsers();
          adminUsers = admin.users;
        }
        setShell((previous) => ({
          me,
          permissions,
          adminUsers,
          companyId: nextCompanyId,
          error: null,
          info: null,
          importPanelKey: previous.importPanelKey,
        }));
        setScreen("signed_in");
      } catch (cause) {
        if (cause instanceof SessionExpiredError) {
          clearAuthDerivedState();
          await signOutAuth().catch(() => undefined);
          setScreen("signed_out");
          setShell((previous) => ({
            ...EMPTY_SHELL,
            importPanelKey: previous.importPanelKey + 1,
            error: "Session expired — sign in again.",
          }));
          return;
        }
        setShell((previous) => ({
          ...previous,
          error: formatApiError(cause),
          info: null,
        }));
        if (cause instanceof ApiClientError && cause.status === 401) {
          clearAuthDerivedState();
          setScreen("signed_out");
        }
      } finally {
        setBusy(false);
      }
    },
    [clearAuthDerivedState]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getAuthSession();
        if (cancelled) {
          return;
        }
        if (session === null) {
          setScreen("signed_out");
          return;
        }
        await loadServerState("");
      } catch {
        if (!cancelled) {
          setScreen("signed_out");
        }
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadServerState]);

  const onSignIn = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBusy(true);
      clearAuthDerivedState();
      try {
        await signInWithEmail(email.trim(), password);
        setPassword("");
        await loadServerState("");
      } catch (cause) {
        setShell((previous) => ({
          ...EMPTY_SHELL,
          importPanelKey: previous.importPanelKey + 1,
          error: formatApiError(cause),
        }));
        setScreen("signed_out");
      } finally {
        setBusy(false);
      }
    },
    [clearAuthDerivedState, email, loadServerState, password]
  );

  const onSignOut = useCallback(async () => {
    setBusy(true);
    try {
      clearAuthDerivedState();
      await signOutAuth();
      setScreen("signed_out");
    } catch (cause) {
      setShell((previous) => ({
        ...EMPTY_SHELL,
        importPanelKey: previous.importPanelKey + 1,
        error: formatApiError(cause),
      }));
      setScreen("signed_out");
    } finally {
      setBusy(false);
    }
  }, [clearAuthDerivedState]);

  const onSessionExpiredFromPanel = useCallback(() => {
    clearAuthDerivedState();
    signOutAuth().catch(() => undefined);
    setScreen("signed_out");
    setShell((previous) => ({
      ...EMPTY_SHELL,
      importPanelKey: previous.importPanelKey + 1,
      error: "Session expired — sign in again.",
    }));
  }, [clearAuthDerivedState]);

  const onShellError = useCallback((message: string) => {
    setShell((previous) => ({ ...previous, error: message, info: null }));
  }, []);

  const onShellInfo = useCallback((message: string | null) => {
    setShell((previous) => ({ ...previous, info: message, error: null }));
  }, []);

  const onReloadPermissions = useCallback(() => {
    loadServerState(shell.companyId).catch(() => undefined);
  }, [loadServerState, shell.companyId]);

  const onCompanyIdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.currentTarget;
      setShell((previous) => ({ ...previous, companyId: value }));
    },
    []
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
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">Clarity Payroll</h1>
          <ThemeToggle />
        </div>
        <Alert>
          <AlertTitle>ⓘ Checking session…</AlertTitle>
        </Alert>
      </main>
    );
  }

  if (screen === "signed_out") {
    return (
      <main className="container mx-auto space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">Clarity Payroll</h1>
          <ThemeToggle />
        </div>
        {shell.error === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>⚠ {shell.error}</AlertTitle>
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

  const {
    me,
    permissions,
    adminUsers,
    companyId: companyFilter,
    error: bannerError,
    info: bannerInfo,
    importPanelKey,
  } = shell;

  const canImport =
    permissions?.permissions.EMPLOYMENT.includes("CREATE") === true;

  return (
    <main className="container mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl">Clarity Payroll</h1>
        <div className="flex gap-2">
          <ThemeToggle />
          <Button
            disabled={busy}
            onClick={onSignOut}
            type="button"
            variant="outline"
          >
            Sign out
          </Button>
        </div>
      </div>

      {bannerError === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>⚠ {bannerError}</AlertTitle>
        </Alert>
      )}
      {bannerInfo === null ? null : (
        <Alert>
          <AlertTitle>ⓘ {bannerInfo}</AlertTitle>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          {me === null ? (
            <Alert>
              <AlertTitle>⚠ No /v1/me payload.</AlertTitle>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span>{me.name}</span>
              <span>·</span>
              <span>{me.email}</span>
              <span>·</span>
              <Badge variant="outline">
                {getStatusGlyph(me.status)} {me.status}
              </Badge>
              <span>·</span>
              <code className="text-xs">{me.id}</code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="companyId">Company id (optional)</Label>
              <Input
                disabled={busy}
                id="companyId"
                onChange={onCompanyIdChange}
                placeholder="uuid or blank for global"
                value={companyFilter}
              />
            </div>
            <Button
              disabled={busy}
              onClick={onReloadPermissions}
              type="button"
              variant="outline"
            >
              Reload permissions
            </Button>
          </div>
          {permissions === null ? (
            <Alert>
              <AlertTitle>⚠ No permissions payload.</AlertTitle>
            </Alert>
          ) : (
            <pre className="overflow-auto rounded bg-muted p-3 text-muted-foreground text-xs">
              {JSON.stringify(permissions.permissions, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {canImport ? (
        <EmployeeImportPanel
          busy={busy}
          companyId={companyFilter}
          key={importPanelKey}
          onError={onShellError}
          onInfo={onShellInfo}
          onSessionExpired={onSessionExpiredFromPanel}
          setBusy={setBusy}
        />
      ) : null}

      {adminUsers === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Admin users (read-only)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Auth subject</TableHead>
                  <TableHead>Id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getStatusGlyph(user.status)} {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{user.authSubject ?? "—"}</code>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{user.id}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
