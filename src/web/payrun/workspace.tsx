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
  ArtifactRow,
  ChecklistItem,
  EmployeeLineDto,
  GateKind,
  GateResult,
  LinePaymentState,
  PayRunWorkspaceView,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { ArtifactsPanel } from "./artifacts-panel";
import { BatchDrawer } from "./batch-drawer";
import { ClosureChecklistDialog } from "./closure-checklist-dialog";
import { EmployeeGrid } from "./employee-grid";
import { EmployeeSlideOver } from "./employee-slide-over";
import { FindingsPanel } from "./findings-panel";
import { GateCheckDialog } from "./gate-check-dialog";
import { PaymentsPanel } from "./payments-panel";
import { ReleasePanel } from "./release-panel";
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

  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  const [closureChecklist, setClosureChecklist] = useState<
    readonly ChecklistItem[] | null
  >(null);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);

  const [paymentsSelection, setPaymentsSelection] = useState<readonly string[]>(
    []
  );
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);

  const [artifacts, setArtifacts] = useState<readonly ArtifactRow[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);

  const [paymentStateByEmployeeId, setPaymentStateByEmployeeId] = useState<
    ReadonlyMap<string, LinePaymentState> | undefined
  >(undefined);

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

  const loadArtifacts = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setArtifactsLoading(true);
    setArtifactsError(null);
    try {
      const res = await payrollApi.getArtifacts(runId);
      setArtifacts(res.artifacts);
    } catch (err) {
      setArtifactsError(
        err instanceof Error ? err.message : "Failed to load artifacts"
      );
    } finally {
      setArtifactsLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (
      view !== null &&
      (view.run.status === "APPROVED" || view.run.status === "CLOSED")
    ) {
      loadArtifacts();
    }
  }, [view, loadArtifacts]);

  useEffect(() => {
    if (
      runId === undefined ||
      view === null ||
      !(view.run.status === "APPROVED" || view.run.status === "CLOSED") ||
      paymentsRefreshKey < 0
    ) {
      return;
    }
    payrollApi.getPayments(runId).then((res) => {
      const map = new Map<string, LinePaymentState>();
      for (const row of res.payments) {
        map.set(row.employmentId, row.state);
      }
      setPaymentStateByEmployeeId(map);
    });
  }, [runId, view, paymentsRefreshKey]);

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

  const handleReleased = useCallback((batchId: string) => {
    setActiveBatchId(batchId);
    setBatchDrawerOpen(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setPaymentsSelection([]);
  }, []);

  const handleBatchChanged = useCallback(() => {
    setPaymentsRefreshKey((k) => k + 1);
  }, []);

  const handleCloseBatchDrawer = useCallback(() => {
    setBatchDrawerOpen(false);
  }, []);

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

  const closeClosureDialog = useCallback(() => {
    if (closureSubmitting) {
      return;
    }
    setClosureDialogOpen(false);
    setClosureChecklist(null);
    setClosureError(null);
  }, [closureSubmitting]);

  const handleClose = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setClosureDialogOpen(true);
    setClosureChecklist(null);
    setClosureError(null);
    setClosureLoading(true);
    try {
      const res = await payrollApi.getClosureChecklist(runId);
      setClosureChecklist(res.checklist);
    } catch (err) {
      setClosureError(
        err instanceof Error ? err.message : "Checklist evaluation failed"
      );
    } finally {
      setClosureLoading(false);
    }
  }, [runId]);

  const handleClosureConfirm = useCallback(async () => {
    if (runId === undefined || closureChecklist === null) {
      return;
    }
    setClosureSubmitting(true);
    setClosureError(null);
    try {
      await payrollApi.closeRun(runId);
      setClosureDialogOpen(false);
      setClosureChecklist(null);
      await reload();
    } catch (err) {
      setClosureError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setClosureSubmitting(false);
    }
  }, [closureChecklist, reload, runId]);

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
        onClose={handleClose}
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

        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <PaymentsPanel
            lines={view.lines}
            onSelectionChange={setPaymentsSelection}
            readOnly={view.run.status === "CLOSED"}
            refreshKey={paymentsRefreshKey}
            runId={runId}
            selectedLineIds={paymentsSelection}
          />
        ) : null}

        {view.run.status === "APPROVED" ? (
          <ReleasePanel
            onCleared={handleClearSelection}
            onReleased={handleReleased}
            runId={runId}
            selectedLineIds={paymentsSelection}
          />
        ) : null}

        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <ArtifactsPanel
            artifacts={artifacts}
            error={artifactsError}
            loading={artifactsLoading}
            onUploaded={loadArtifacts}
            runId={runId}
          />
        ) : null}

        <EmployeeGrid
          lines={view.lines}
          onEditLine={handleEditLine}
          onSelectEmployee={handleSelectEmployee}
          onViewDerivation={handleViewDerivation}
          onViewFindings={handleViewDerivation}
          paymentStateByEmployeeId={paymentStateByEmployeeId}
        />
      </div>

      <EmployeeSlideOver
        initialTab={slideOverTab}
        line={selectedLine}
        onClose={closeSlideOver}
        open={selectedLine !== null}
        runId={runId ?? ""}
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

      <ClosureChecklistDialog
        checklist={closureChecklist}
        error={closureError}
        loading={closureLoading}
        onClose={closeClosureDialog}
        onConfirm={handleClosureConfirm}
        open={closureDialogOpen}
        submitting={closureSubmitting}
      />

      <BatchDrawer
        artifacts={artifacts}
        batchId={activeBatchId}
        onChanged={handleBatchChanged}
        onClose={handleCloseBatchDrawer}
        open={batchDrawerOpen}
        runId={runId}
      />
    </div>
  );
}

export { WorkspacePage };
