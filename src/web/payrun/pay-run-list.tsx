/**
 * Pay-run list — `GET /v1/pay-runs`, scoped by `ScopeContext` and filtered
 * client-side when the scope names specific companies. See design doc §4.
 */

import { ReceiptTextIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { StatusBadge } from "@/components/payroll/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayRunSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { useScopeContext } from "@/web/context/scope-context";

function formatPeriod(run: PayRunSummary): string {
  return `${String(run.month).padStart(2, "0")}/${run.year}`;
}

function isRunStatus(
  status: string
): status is Parameters<typeof StatusBadge>[0]["status"] {
  return (
    status === "DRAFT" ||
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "CLOSED"
  );
}

interface PayRunRowProps {
  run: PayRunSummary;
  onOpen: (runId: string) => void;
}

function PayRunRow({ run, onOpen }: PayRunRowProps) {
  const handleClick = useCallback(() => {
    onOpen(run.id);
  }, [onOpen, run.id]);

  return (
    <TableRow className="cursor-pointer" onClick={handleClick}>
      <TableCell>{run.companyName}</TableCell>
      <TableCell className="tabular-nums">{formatPeriod(run)}</TableCell>
      <TableCell>
        <StatusBadge status={isRunStatus(run.status) ? run.status : "DRAFT"} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {run.employeeCount}
      </TableCell>
    </TableRow>
  );
}

function PayRunListPage() {
  const [, navigate] = useLocation();
  const { scope, reportingMonth } = useScopeContext();
  const [runs, setRuns] = useState<PayRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    payrollApi
      .getPayRuns({ reportingMonth })
      .then((result) => {
        if (!cancelled) {
          setRuns(result);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportingMonth]);

  const visibleRuns =
    scope.mode === "all"
      ? runs
      : runs.filter((run) => scope.companyIds.includes(run.companyId));

  const openRun = useCallback(
    (runId: string) => {
      navigate(`/pay-runs/${runId}`);
    },
    [navigate]
  );

  if (!loading && visibleRuns.length === 0) {
    return (
      <EmptyState
        description="No pay runs found for the current scope and reporting month."
        icon={<ReceiptTextIcon />}
        title="No Pay Runs"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Employees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRuns.map((run) => (
              <PayRunRow key={run.id} onOpen={openRun} run={run} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export { PayRunListPage };
