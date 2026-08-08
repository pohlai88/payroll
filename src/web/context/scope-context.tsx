/**
 * `ScopeContext` — holds the user's chosen company scope + reporting month.
 *
 * This context only stores state and exposes setters. It never derives
 * anything (e.g. a resolved company list, or an "effective" companyId) —
 * that derivation belongs to whichever screen consumes the scope, since
 * different screens interpret `{ mode: "selected" }` differently (some
 * require exactly one company, others accept many).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";

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

function parseScopeParam(raw: string | null): CompanyScope {
  if (raw === null || raw === "" || raw === SCOPE_ALL) {
    return { mode: "all" };
  }
  const companyIds = raw.split(",").filter((id) => id.length > 0);
  return companyIds.length === 0
    ? { mode: "all" }
    : { mode: "selected", companyIds };
}

function serializeScopeParam(scope: CompanyScope): string {
  return scope.mode === "all" ? SCOPE_ALL : scope.companyIds.join(",");
}

function readScopeFromUrl(): CompanyScope {
  if (typeof window === "undefined") {
    return { mode: "all" };
  }
  const params = new URLSearchParams(window.location.search);
  return parseScopeParam(params.get(SCOPE_PARAM));
}

function ScopeProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [scope, setScopeState] = useState<CompanyScope>(readScopeFromUrl);
  const [reportingMonth, setReportingMonth] = useState(defaultReportingMonth);

  // Sync scope into the URL query string whenever it changes, preserving the
  // current path and any other query params.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const serialized = serializeScopeParam(scope);
    if (scope.mode === "all") {
      params.delete(SCOPE_PARAM);
    } else {
      params.set(SCOPE_PARAM, serialized);
    }
    const query = params.toString();
    const nextUrl = query === "" ? location : `${location}?${query}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      navigate(nextUrl, { replace: true });
    }
    // `location` intentionally excluded — this effect reacts to `scope`
    // changes only; navigation triggered by the browser (back/forward) is
    // handled by the popstate-driven re-read below, not this effect.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  }, [scope]);

  // Pick up scope changes from browser back/forward navigation.
  useEffect(() => {
    setScopeState(readScopeFromUrl());
  }, [location]);

  const setScope = useCallback((next: CompanyScope) => {
    setScopeState(next);
  }, []);

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

export { ScopeProvider, useScopeContext };
export type { CompanyScope, ScopeContextValue };
