import { MoneyCell } from "@/components/payroll/money-cell";
import type { PaymentRegisterDto } from "@/web/api/payroll-api";

interface PaymentRegisterProps {
  readonly data: PaymentRegisterDto;
}

function PaymentRegister({ data }: PaymentRegisterProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Payment Register</h2>
          <p className="text-muted-foreground text-xs">
            {data.reportMeta.runId} · {data.reportMeta.runStatus}
          </p>
        </div>
        <button
          className="rounded border px-3 py-1.5 font-medium text-xs"
          onClick={window.print}
          type="button"
        >
          Print
        </button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left font-medium text-muted-foreground">
              Employee
            </th>
            <th className="py-2 text-left font-medium text-muted-foreground">
              Code
            </th>
            <th className="py-2 text-right font-medium text-muted-foreground">
              Net Pay
            </th>
            <th className="py-2 text-left font-medium text-muted-foreground">
              Payment Status
            </th>
            <th className="py-2 text-left font-medium text-muted-foreground">
              Bank Account
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr className="border-border/50 border-b" key={row.lineId}>
              <td className="py-2">{row.employeeName}</td>
              <td className="py-2 font-mono text-muted-foreground text-xs">
                {row.employeeCode}
              </td>
              <td className="py-2 text-right">
                <MoneyCell sen={row.netSen} />
              </td>
              <td className="py-2 text-xs">{row.paymentState ?? "—"}</td>
              <td className="py-2 font-mono text-xs">
                {row.maskedBankAccount ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2" colSpan={2}>
              Total
            </td>
            <td className="py-2 text-right">
              <MoneyCell sen={data.totalNetSen} />
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <p className="text-muted-foreground text-xs">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { PaymentRegister };
