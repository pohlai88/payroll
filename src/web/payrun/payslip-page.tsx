/**
 * Full-page bilingual payslip — /pay-runs/:runId/payslip/:lineId
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/domain/derive/i18n/render";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import { PayslipDocument } from "./payslip-document/payslip-document";
import type { PayslipDocumentDto } from "./payslip-document/types";

function PayslipPage() {
  const { runId, lineId } = useParams<{ runId: string; lineId: string }>();
  const [dto, setDto] = useState<PayslipDocumentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    if (!(runId && lineId)) {
      return;
    }
    payrollApi
      .getPayslip(runId, lineId)
      .then(setDto)
      .catch((e) => setError(formatApiError(e, "Failed to load payslip")));
  }, [runId, lineId]);

  const handleSetEn = useCallback(() => setLang("en"), []);
  const handleSetMs = useCallback(() => setLang("ms"), []);
  const handlePrint = useCallback(() => window.print(), []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--doc-fill-header)" }}>
      {/* Actions bar — hidden during print */}
      <div
        className="payslip-actions"
        data-no-print
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1.5rem",
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <a
          className="text-muted-foreground text-sm"
          href={`/pay-runs/${runId}`}
        >
          ← {lang === "en" ? "Back to workspace" : "Kembali ke ruang kerja"}
        </a>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <Button
              className="rounded-none"
              onClick={handleSetEn}
              size="sm"
              type="button"
              variant={lang === "en" ? "default" : "ghost"}
            >
              EN
            </Button>
            <Button
              className="rounded-none"
              onClick={handleSetMs}
              size="sm"
              type="button"
              variant={lang === "ms" ? "default" : "ghost"}
            >
              BM
            </Button>
          </div>
          <Button
            data-no-print
            onClick={handlePrint}
            size="sm"
            variant="outline"
          >
            {lang === "en" ? "Print" : "Cetak"}
          </Button>
        </div>
      </div>

      {/* Document */}
      <div style={{ padding: "2rem" }}>
        {error !== null && (
          <div className="p-4 text-destructive">Error: {error}</div>
        )}
        {dto !== null && <PayslipDocument dto={dto} lang={lang} />}
        {!(dto !== null || error !== null) && (
          <div className="p-16 text-center text-muted-foreground">Loading…</div>
        )}
      </div>
    </div>
  );
}

export { PayslipPage };
