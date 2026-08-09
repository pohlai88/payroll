import { MoneyCell } from "@/components/payroll/money-cell";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base text-foreground">
            Payment Register
          </h2>
          <p className="text-muted-foreground text-xs">
            {data.reportMeta.runId} · {data.reportMeta.runStatus}
          </p>
        </div>
        <Button
          onClick={() => window.print()}
          size="sm"
          type="button"
          variant="outline"
        >
          Print
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-right">Net Pay</TableHead>
            <TableHead>Payment Status</TableHead>
            <TableHead>Bank Account</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.lineId}>
              <TableCell>{row.employeeName}</TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">
                {row.employeeCode}
              </TableCell>
              <TableCell className="text-right">
                <MoneyCell sen={row.netSen} />
              </TableCell>
              <TableCell className="text-xs">
                {row.paymentState ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.maskedBankAccount ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right">
              <MoneyCell sen={data.totalNetSen} />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
      {data.incomplete ? (
        <p className="text-muted-foreground text-xs">
          Some net amounts were unknown and omitted from the total — not treated
          as zero.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { PaymentRegister };
