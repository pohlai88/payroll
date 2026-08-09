/**
 * Closure seal panel — what this run's closure is worth as evidence.
 *
 * It states three separate things and does not blur them: the seal recomputes,
 * the company's chain around it is unbroken, and whether anyone outside this
 * system has countersigned. The third is off by default and the panel says so
 * plainly rather than implying a guarantee nobody made.
 */

import { useCallback, useState } from "react";
import { HashChip, shortHash } from "@/components/payroll/hash-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ClosureChainResponse,
  RunSeal,
  RunSealResponse,
  SealStatus,
  TimestampStatus,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface ClosureSealPanelProps {
  readonly runId: string;
  readonly seal: RunSealResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onReverify: () => void;
}

function formatInstant(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

interface VerdictProps {
  readonly ok: boolean;
  readonly okLabel: string;
  readonly badLabel: string;
}

function Verdict({ ok, okLabel, badLabel }: VerdictProps) {
  return (
    <Badge variant={ok ? "success" : "bad"}>
      {ok ? `✓ ${okLabel}` : `✕ ${badLabel}`}
    </Badge>
  );
}

interface FactProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Fact({ label, children }: FactProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 text-right text-sm">{children}</span>
    </div>
  );
}

/**
 * The client-facing switch for third-party stamping. It is a deployment
 * setting rather than a button, so the panel shows what to set and where —
 * pretending otherwise would put a control here that cannot work.
 */
function TimestampRow({ timestamp }: { readonly timestamp: TimestampStatus }) {
  if (timestamp.tokenArtifactId !== null) {
    return (
      <p className="text-muted-foreground text-xs">
        Countersigned by {timestamp.tsaUrl ?? "a time-stamp authority"}
        {timestamp.genTime === null
          ? null
          : ` at ${formatInstant(timestamp.genTime)}`}
        . The token is in Artifacts as <code>manifest.json.tsr</code>; verify it
        with <code>openssl ts -verify</code>.
      </p>
    );
  }

  if (timestamp.configured) {
    return (
      <p className="text-muted-foreground text-xs">
        External stamping is on ({timestamp.tsaUrl}) but this run has no token
        yet — the authority was unreachable at closure. Closing was not blocked
        by it, and it can still be obtained.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-xs">
      No external countersignature: the chain above is this system attesting to
      itself. If a client wants a third party on the record, set{" "}
      <code>TSA_URL={timestamp.suggestedTsaUrl}</code> and close future runs —
      note that DigiCert is not an MCMC-recognised date/time stamp service under
      the Digital Signature Act 1997.
    </p>
  );
}

function ChainRow({
  seal,
  isCurrent,
}: {
  readonly seal: SealStatus;
  readonly isCurrent: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 text-sm",
        isCurrent && "bg-muted/50"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-8 shrink-0 text-muted-foreground text-xs tabular-nums">
          #{seal.sequence}
        </span>
        <span className="truncate">{seal.runId}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortHash(seal.sealHash)}
        </span>
        <Badge className="font-mono text-[10px]" variant={seal.ok ? "success" : "bad"}>
          {seal.ok ? "OK" : "BROKEN"}
        </Badge>
      </div>
    </li>
  );
}

/** Fetched on demand: most visits to a closed run never open the chain. */
function ChainSection({ runId }: { readonly runId: string }) {
  const [chain, setChain] = useState<ClosureChainResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setChain(await payrollApi.getClosureChain(runId));
    } catch {
      setError("Failed to load the closure chain");
    } finally {
      setLoading(false);
    }
  }, [open, runId]);

  return (
    <>
      <div>
        <Button onClick={handleToggle} size="sm" variant="outline">
          {open ? "Hide chain" : "View chain"}
        </Button>
      </div>

      {open ? (
        <div className="rounded-md border">
          {loading ? (
            <p className="px-3 py-2 text-muted-foreground text-sm">
              Loading chain…
            </p>
          ) : null}
          {error === null ? null : (
            <p className="px-3 py-2 text-destructive text-sm">{error}</p>
          )}
          {chain === null ? null : (
            <ul className="divide-y">
              {chain.seals.map((entry) => (
                <ChainRow
                  isCurrent={entry.runId === runId}
                  key={entry.sealHash}
                  seal={entry}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}

function SealBody({
  runId,
  seal,
  timestamp,
}: {
  readonly runId: string;
  readonly seal: RunSeal;
  readonly timestamp: TimestampStatus;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="divide-y">
        <Fact label="Seal">
          <HashChip label="seal hash" value={seal.sealHash} />
        </Fact>
        <Fact label="Position">
          #{seal.sequence} of {seal.chainLength} in this company's closure chain
        </Fact>
        <Fact label="Links to">
          {seal.previousSealHash === null ? (
            <span className="text-muted-foreground">
              nothing — first closure for this company
            </span>
          ) : (
            <HashChip
              label="previous seal hash"
              value={seal.previousSealHash}
            />
          )}
        </Fact>
        <Fact label="Manifest">
          <HashChip label="manifest sha256" value={seal.manifestSha256} />
        </Fact>
        <Fact label="Closed">
          {formatInstant(seal.closedAt)} by {seal.closedBy}
        </Fact>
      </div>

      {seal.problems.length === 0 ? null : (
        <ul className="space-y-1 rounded-md bg-status-bad-fill p-2 text-status-bad-ink text-xs">
          {seal.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <TimestampRow timestamp={timestamp} />

      <ChainSection runId={runId} />
    </div>
  );
}

function ClosureSealPanel({
  runId,
  seal,
  loading,
  error,
  onReverify,
}: ClosureSealPanelProps) {
  const issued = seal?.seal ?? null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="font-medium text-sm">Closure seal</span>
        <div className="flex items-center gap-2">
          {issued === null ? null : (
            <>
              <Verdict
                badLabel="Seal broken"
                ok={issued.ok}
                okLabel="Seal verified"
              />
              <Verdict
                badLabel="Chain broken"
                ok={issued.chainOk}
                okLabel="Chain intact"
              />
            </>
          )}
          <Button
            disabled={loading}
            onClick={onReverify}
            size="sm"
            variant="ghost"
          >
            {loading ? "Verifying…" : "Re-verify"}
          </Button>
        </div>
      </div>

      {error === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{error}</p>
      )}

      {loading && seal === null ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          Verifying the closure chain…
        </p>
      ) : null}

      {seal !== null && issued === null ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          This run has not been closed, so nothing has been sealed yet.
        </p>
      ) : null}

      {seal === null || issued === null ? null : (
        <SealBody runId={runId} seal={issued} timestamp={seal.timestamp} />
      )}
    </div>
  );
}

export type { ClosureSealPanelProps };
export { ClosureSealPanel };
