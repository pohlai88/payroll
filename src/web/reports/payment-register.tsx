/**
 * @feature reports
 * @layer ui
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Payment register report view.
 */

import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PaymentRegisterDto } from "@/web/api/payroll-api";

interface PaymentRegisterProps {
  readonly data: PaymentRegisterDto;
}

function PaymentRegister({ data }: PaymentRegisterProps) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-base text-foreground">
            Payment Register
          </h2>
          <p className="truncate text-muted-foreground text-xs">
            {data.reportMeta.runId} · {data.reportMeta.runStatus}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="h-auto rounded-sm" variant="secondary">
            {data.rows.length} rows
          </Badge>
          <Button
            onClick={() => window.print()}
            size="sm"
            type="button"
            variant="outline"
          >
            Print
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="first:pl-4">Employee</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-right">Net Pay</TableHead>
            <TableHead>Payment Status</TableHead>
            <TableHead>Bank Account</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.lineId}>
              <TableCell className="first:pl-4 font-medium">
                {row.employeeName}
              </TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">
                {row.employeeCode}
              </TableCell>
              <TableCell className="text-right">
                <MoneyCell sen={row.netSen} />
              </TableCell>
              <TableCell>
                <Badge className="h-auto rounded-sm px-1.5" variant="outline">
                  {row.paymentState ?? "—"}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.maskedBankAccount ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="first:pl-4" colSpan={2}>
              Total
            </TableCell>
            <TableCell className="text-right">
              <MoneyCell sen={data.totalNetSen} />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
      <div className="space-y-1 border-t px-4 py-3 text-muted-foreground text-xs sm:px-5">
        {data.incomplete ? (
          <p>
            Some net amounts were unknown and omitted from the total — not
            treated as zero.
          </p>
        ) : null}
        <p>
          Generated: {data.reportMeta.generatedAt} · Schema v
          {data.reportMeta.reportSchemaVersion}
        </p>
      </div>
    </Card>
  );
}

export { PaymentRegister };
