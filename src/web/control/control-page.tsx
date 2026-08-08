/**
 * Control — placeholder for Phase 6+, per design doc §2.1 file layout.
 */

import { ShieldCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function ControlPage() {
  return (
    <EmptyState
      badge="Phase 6+"
      description="Findings, gates, and approvals are not yet in scope."
      icon={<ShieldCheckIcon />}
      title="Control"
    />
  );
}

export { ControlPage };
