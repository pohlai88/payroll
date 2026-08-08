/**
 * `ScopeContext` — holds the user's chosen company scope + reporting month.
 *
 * This context only stores state and exposes setters. It never derives
 * anything (e.g. a resolved company list, or an "effective" companyId) —
 * that derivation belongs to whichever screen consumes the scope, since
 * different screens interpret `{ mode: "selected" }` differently (some
 * require exactly one company, others accept many).
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
import { useLocation, useSearch } from "wouter";

/**
 * `{ mode: "all" }` and `{ mode: "selected", companyIds: [] }` are distinct:
 * an empty `companyIds` list must never be silently treated as "all" — the
 * caller has to say so explicitly.
 */
type CompanyScope =
  | { mode: "all" }
  | { mode: "selected"; companyIds: string[] };

interface ScopeContextValue {
  scope: CompanyScope;
  /** `YYYY-MM`. */
  reportingMonth: string;
  setScope: (scope: CompanyScope) => void;
  setReportingMonth: (month: string) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

const SCOPE_PARAM = "scope";
const SCOPE_ALL = "all";

function defaultReportingMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseScopeParam(search: string): CompanyScope {
  const raw = new URLSearchParams(search).get(SCOPE_PARAM);
  if (raw === null || raw === "" || raw === SCOPE_ALL) {
    return { mode: "all" };
  }
  const companyIds = raw.split(",").filter((id) => id.length > 0);
  return companyIds.length === 0
    ? { mode: "all" }
    : { mode: "selected", companyIds };
}

function withScopeParam(search: string, scope: CompanyScope): string {
  const params = new URLSearchParams(search);
  if (scope.mode === "all") {
    params.delete(SCOPE_PARAM);
  } else {
    params.set(SCOPE_PARAM, scope.companyIds.join(","));
  }
  return params.toString();
}

function ScopeProvider({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const search = useSearch();
  const [scope, setScopeState] = useState<CompanyScope>(() =>
    parseScopeParam(search)
  );
  const [reportingMonth, setReportingMonth] = useState(defaultReportingMonth);

  // Browser back/forward (or a deep link) changes the URL directly — mirror
  // that into state so `scope` stays the single source of truth for reads.
  useEffect(() => {
    setScopeState(parseScopeParam(search));
  }, [search]);

  const setScope = useCallback(
    (next: CompanyScope) => {
      setScopeState(next);
      const nextSearch = withScopeParam(search, next);
      const nextUrl = nextSearch === "" ? path : `${path}?${nextSearch}`;
      navigate(nextUrl, { replace: true });
    },
    [navigate, path, search]
  );

  const value = useMemo(
    () => ({ scope, reportingMonth, setScope, setReportingMonth }),
    [scope, reportingMonth, setScope]
  );

  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}

function useScopeContext(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (ctx === null) {
    throw new Error("useScopeContext must be used within ScopeProvider");
  }
  return ctx;
}

export type { CompanyScope, ScopeContextValue };
export { ScopeProvider, useScopeContext };
