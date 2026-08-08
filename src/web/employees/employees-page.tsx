/**
 * Employees — placeholder. The real employee list + import panel
 * (`EmployeeImportPanel`, already built) gets re-wired here, scoped to
 * `CompanyScope`, in a later SPA task.
 */

import { UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function EmployeesPage() {
  return (
    <EmptyState
      description="The employee list and import panel land in a later SPA task."
      icon={<UsersIcon />}
      title="Employees"
    />
  );
}

export { EmployeesPage };
