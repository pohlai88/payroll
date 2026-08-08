/**
 * Pay-run workspace — placeholder. The real `PayRunWorkspaceView` render
 * (totals strip, employee grid, slide-over) lands in a later SPA task; see
 * design doc §4.
 */

import { ReceiptTextIcon } from "lucide-react";
import { useParams } from "wouter";
import { EmptyState } from "@/components/ui/empty-state";

function WorkspacePage() {
  const { runId } = useParams<{ runId: string }>();
  return (
    <EmptyState
      badge={runId}
      description="The workspace (totals strip, employee grid, payslip preview) lands in a later SPA task."
      icon={<ReceiptTextIcon />}
      title="Pay Run Workspace"
    />
  );
}

export { WorkspacePage };
