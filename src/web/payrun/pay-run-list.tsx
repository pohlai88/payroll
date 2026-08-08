/**
 * Pay-run list — placeholder. Task 3 only wires the shell + routing; the
 * real `GET /v1/pay-runs` list view lands in a later SPA task.
 */

import { ReceiptTextIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function PayRunListPage() {
  return (
    <EmptyState
      description="The pay-run list (scoped by company + reporting month) lands in a later SPA task."
      icon={<ReceiptTextIcon />}
      title="Pay Runs"
    />
  );
}

export { PayRunListPage };
