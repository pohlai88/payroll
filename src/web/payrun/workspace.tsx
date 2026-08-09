/**
 * Pay-run workspace orchestrator — fetches the `PayRunWorkspaceView` for the
 * `:runId` route param and composes `RunHeader` + `TotalsStrip` +
 * `FindingsPanel` + `EmployeeGrid` + `EmployeeSlideOver`. Review/Approve run
 * a gate check first; mutations wait for server confirmation then refetch.
 */

import { ReceiptTextIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import type { RunStatus } from "@/components/payroll/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  EmployeeLineDto,
  GateKind,
  GateResult,
  PayRunWorkspaceView,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { EmployeeGrid } from "./employee-grid";
import { EmployeeSlideOver } from "./employee-slide-over";
import { FindingsPanel } from "./findings-panel";
import { GateCheckDialog } from "./gate-check-dialog";
import { RunHeader } from "./run-header";
import { TotalsStrip } from "./totals-strip";

function isRunStatus(status: string): status is RunStatus {
  return (
    status === "DRAFT" ||
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "CLOSED"
  );
}

function WorkspacePage() {
  const { runId } = useParams<{ runId: string }>();
  const [view, setView] = useState<PayRunWorkspaceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );
  const [slideOverTab, setSlideOverTab] = useState<
    "line" | "payslip" | "derivation"
  >("line");

  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [pendingGate, setPendingGate] = useState<GateKind | null>(null);
  const [gateResult, setGateResult] = useState<GateResult | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await payrollApi.getWorkspace(runId);
      setView(next);
    } catch {
      setError("Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openSlideOver = useCallback(
    (employeeId: string, tab: "line" | "payslip" | "derivation") => {
      setSelectedEmployeeId(employeeId);
      setSlideOverTab(tab);
    },
    []
  );

  const closeSlideOver = useCallback(() => {
    setSelectedEmployeeId(null);
  }, []);

  const handleSelectEmployee = useCallback(
    (employeeId: string) => openSlideOver(employeeId, "line"),
    [openSlideOver]
  );
  const handleEditLine = useCallback(
    (employeeId: string) => openSlideOver(employeeId, "line"),
    [openSlideOver]
  );
  const handleViewDerivation = useCallback(
    (employeeId: string) => openSlideOver(employeeId, "derivation"),
    [openSlideOver]
  );

  const handleRecompute = useCallback(() => {
    if (runId === undefined) {
      return;
    }
    payrollApi.recompute(runId).then(reload);
  }, [runId, reload]);

  const closeGateDialog = useCallback(() => {
    if (gateSubmitting) {
      return;
    }
    setGateDialogOpen(false);
    setPendingGate(null);
    setGateResult(null);
    setGateError(null);
  }, [gateSubmitting]);

  const beginGateCheck = useCallback(
    async (gate: GateKind) => {
      if (runId === undefined) {
        return;
      }
      setPendingGate(gate);
      setGateDialogOpen(true);
      setGateResult(null);
      setGateError(null);
      setGateLoading(true);
      try {
        const result = await payrollApi.evaluateGate(runId, gate);
        setGateResult(result);
      } catch (err) {
        setGateError(
          err instanceof Error ? err.message : "Gate evaluation failed"
        );
      } finally {
        setGateLoading(false);
      }
    },
    [runId]
  );

  const handleReview = useCallback(() => {
    beginGateCheck("REVIEW");
  }, [beginGateCheck]);

  const handleApprove = useCallback(() => {
    beginGateCheck("APPROVAL");
  }, [beginGateCheck]);

  const handleGateConfirm = useCallback(async () => {
    if (
      runId === undefined ||
      view === null ||
      pendingGate === null ||
      gateResult?.ok !== true
    ) {
      return;
    }
    const { calcRevision } = view.run;
    if (calcRevision === null || calcRevision === "") {
      setGateError("Missing calcRevision — recompute the run first");
      return;
    }
    setGateSubmitting(true);
    setGateError(null);
    try {
      if (pendingGate === "REVIEW") {
        await payrollApi.review(runId, calcRevision);
      } else if (pendingGate === "APPROVAL") {
        await payrollApi.approve(runId, calcRevision);
      }
      setGateDialogOpen(false);
      setPendingGate(null);
      setGateResult(null);
      await reload();
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Mutation failed");
    } finally {
      setGateSubmitting(false);
    }
  }, [gateResult, pendingGate, reload, runId, view]);

  if (runId === undefined) {
    return (
      <EmptyState
        description="No pay run selected."
        icon={<ReceiptTextIcon />}
        title="Pay Run Workspace"
      />
    );
  }

  if (loading && view === null) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Loading workspace…
      </div>
    );
  }

  if (error !== null || view === null) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive text-sm">
        {error ?? "Pay run not found"}
      </div>
    );
  }

  const selectedLine: EmployeeLineDto | null =
    view.lines.find((line) => line.employeeId === selectedEmployeeId) ?? null;

  return (
    <div className="-m-6 flex flex-col gap-4">
      <RunHeader
        onApprove={handleApprove}
        onRecompute={handleRecompute}
        onReview={handleReview}
        view={view}
      />

      <div className="flex flex-col gap-4 px-6 pb-6">
        <TotalsStrip tiles={view.totals} />

        <FindingsPanel
          findingsSummary={view.findingsSummary}
          onChanged={reload}
          runId={runId}
        />

        <EmployeeGrid
          lines={view.lines}
          onEditLine={handleEditLine}
          onSelectEmployee={handleSelectEmployee}
          onViewDerivation={handleViewDerivation}
          onViewFindings={handleViewDerivation}
        />
      </div>

      <EmployeeSlideOver
        initialTab={slideOverTab}
        line={selectedLine}
        onClose={closeSlideOver}
        open={selectedLine !== null}
        runStatus={isRunStatus(view.run.status) ? view.run.status : "DRAFT"}
      />

      <GateCheckDialog
        error={gateError}
        gate={pendingGate}
        loading={gateLoading}
        onClose={closeGateDialog}
        onConfirm={handleGateConfirm}
        open={gateDialogOpen}
        result={gateResult}
        submitting={gateSubmitting}
      />
    </div>
  );
}

export { WorkspacePage };
