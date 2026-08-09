/**
 * Pay-run workspace orchestrator — fetches the `PayRunWorkspaceView` for the
 * `:runId` route param and composes `RunHeader` + `TotalsStrip` +
 * `FindingsPanel` + `EmployeeGrid` + `EmployeeSlideOver`. Review/Approve run
 * a gate check first; mutations wait for server confirmation then refetch.
 */

import { ReceiptTextIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { isRunStatus } from "@/components/payroll/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncLoad } from "@/hooks/use-async-load";
import { formatApiError } from "@/web/api/format-error";
import type {
  ChecklistItem,
  EmployeeLineDto,
  GateKind,
  GateResult,
  LinePaymentState,
  PayRunWorkspaceView,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import {
  ClosureChecklistDialog,
  type ClosureOutcome,
} from "./dialogs/closure-checklist-dialog";
import { GateCheckDialog } from "./dialogs/gate-check-dialog";
import { BatchDrawer } from "./drawers/batch-drawer";
import { EmployeeSlideOver } from "./drawers/employee-slide-over";
import { EmployeeGrid } from "./employee/employee-grid";
import { ArtifactsPanel } from "./panels/artifacts-panel";
import { ClosureSealPanel } from "./panels/closure-seal-panel";
import { FindingsPanel } from "./panels/findings-panel";
import { PaymentsPanel } from "./panels/payments-panel";
import { ReleasePanel } from "./panels/release-panel";
import { RunHeader } from "./panels/run-header";
import { TotalsStrip } from "./panels/totals-strip";

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
  const [closureOutcome, setClosureOutcome] = useState<ClosureOutcome | null>(
    null
  );

  const [paymentsSelection, setPaymentsSelection] = useState<readonly string[]>(
    []
  );
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);

  const [recomputeError, setRecomputeError] = useState<string | null>(null);

  const fetchArtifacts = useCallback(async () => {
    if (runId === undefined) {
      return [];
    }
    const res = await payrollApi.getArtifacts(runId);
    return res.artifacts;
  }, [runId]);

  const {
    data: artifactsData,
    loading: artifactsLoading,
    error: artifactsError,
    reload: loadArtifacts,
  } = useAsyncLoad(fetchArtifacts, "Failed to load artifacts");

  const artifacts = artifactsData ?? [];

  const fetchPayments = useCallback(async () => {
    if (runId === undefined) {
      return [];
    }
    const res = await payrollApi.getPayments(runId);
    return res.payments;
  }, [runId]);

  const {
    data: paymentsData,
    loading: paymentsLoading,
    error: paymentsError,
    reload: loadPayments,
  } = useAsyncLoad(fetchPayments, "Failed to load payments");

  const payments = paymentsData ?? [];

  const fetchSeal = useCallback(async () => {
    if (runId === undefined) {
      return null;
    }
    return await payrollApi.getRunSeal(runId);
  }, [runId]);

  const {
    data: seal,
    loading: sealLoading,
    error: sealError,
    reload: loadSeal,
  } = useAsyncLoad(fetchSeal, "Failed to verify the closure seal");

  // Derived from the single payments list — no separate fetch needed.
  const paymentStateByEmployeeId = useMemo<
    ReadonlyMap<string, LinePaymentState> | undefined
  >(() => {
    if (payments.length === 0) {
      return;
    }
    const map = new Map<string, LinePaymentState>();
    for (const row of payments) {
      map.set(row.employmentId, row.state);
    }
    return map;
  }, [payments]);

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

  useEffect(() => {
    if (
      view !== null &&
      (view.run.status === "APPROVED" || view.run.status === "CLOSED")
    ) {
      loadArtifacts();
    }
  }, [view, loadArtifacts]);

  useEffect(() => {
    if (view !== null && view.run.status === "CLOSED") {
      loadSeal();
    }
  }, [view, loadSeal]);

  // paymentsRefreshKey is a refetch trigger — bumping it forces
  // a reload without changing the effect dependencies otherwise.
  // biome-ignore lint/correctness/useExhaustiveDependencies: paymentsRefreshKey is a refetch trigger, not a read dependency
  useEffect(() => {
    if (
      runId === undefined ||
      view === null ||
      !(view.run.status === "APPROVED" || view.run.status === "CLOSED")
    ) {
      return;
    }
    loadPayments();
  }, [runId, view, paymentsRefreshKey, loadPayments]);

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

  const handleRecompute = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setRecomputeError(null);
    try {
      await payrollApi.recompute(runId);
      await reload();
    } catch (err) {
      setRecomputeError(formatApiError(err, "Recompute failed"));
    }
  }, [runId, reload]);

  /** Opens the batch drawer for a given batchId — used both after a fresh
   * release commit (via ReleasePanel's onReleased) and for re-entry from
   * PaymentsPanel's "View batch" action on RELEASED/PAID lines. */
  const openBatchDrawer = useCallback((batchId: string) => {
    setActiveBatchId(batchId);
    setBatchDrawerOpen(true);
  }, []);

  const handleReleased = useCallback(
    (batchId: string) => {
      openBatchDrawer(batchId);
      // Refresh both payments (lines now RELEASED) and artifacts
      // (PAYMENT_REGISTER artifact just created by the server).
      setPaymentsRefreshKey((k) => k + 1);
      loadArtifacts();
    },
    [openBatchDrawer, loadArtifacts]
  );

  const handleClearSelection = useCallback(() => {
    setPaymentsSelection([]);
  }, []);

  const handlePaymentsChanged = useCallback(() => {
    setPaymentsRefreshKey((k) => k + 1);
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
        setGateError(formatApiError(err, "Gate evaluation failed"));
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
    setClosureOutcome(null);
  }, [closureSubmitting]);

  const handleClose = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setClosureDialogOpen(true);
    setClosureChecklist(null);
    setClosureError(null);
    setClosureOutcome(null);
    setClosureLoading(true);
    try {
      const res = await payrollApi.getClosureChecklist(runId);
      setClosureChecklist(res.checklist);
    } catch (err) {
      setClosureError(formatApiError(err, "Checklist evaluation failed"));
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
      const result = await payrollApi.closeRun(runId);
      // The dialog stays open on the seal it just produced; `Done` dismisses it.
      setClosureOutcome({
        seal: result.seal,
        timestamp: result.timestamp,
      });
      setClosureChecklist(null);
      await reload();
    } catch (err) {
      setClosureError(formatApiError(err, "Close failed"));
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
      setGateError(formatApiError(err, "Mutation failed"));
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
        {recomputeError === null ? null : (
          <p className="text-destructive text-sm">{recomputeError}</p>
        )}

        <TotalsStrip tiles={view.totals} />

        <FindingsPanel
          findingsSummary={view.findingsSummary}
          onChanged={reload}
          runId={runId}
        />

        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <PaymentsPanel
            error={paymentsError}
            lines={view.lines}
            loading={paymentsLoading}
            onChanged={handlePaymentsChanged}
            onSelectionChange={setPaymentsSelection}
            onViewBatch={openBatchDrawer}
            payments={payments}
            readOnly={view.run.status === "CLOSED"}
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

        {view.run.status === "CLOSED" ? (
          <ClosureSealPanel
            error={sealError}
            loading={sealLoading}
            onReverify={loadSeal}
            runId={runId}
            seal={seal}
          />
        ) : null}

        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <ArtifactsPanel
            artifacts={artifacts}
            error={artifactsError}
            loading={artifactsLoading}
            onUploaded={loadArtifacts}
            readOnly={view.run.status === "CLOSED"}
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
        outcome={closureOutcome}
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
