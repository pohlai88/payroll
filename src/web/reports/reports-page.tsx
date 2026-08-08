/**
 * Reports — placeholder for Phase 8, per design doc §2.1 file layout.
 */

import { FileTextIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function ReportsPage() {
  return (
    <EmptyState
      badge="Phase 8"
      description="Reporting is not yet in scope."
      icon={<FileTextIcon />}
      title="Reports"
    />
  );
}

export { ReportsPage };
