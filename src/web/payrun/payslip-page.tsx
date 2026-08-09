/**
 * Full-page bilingual payslip — /pay-runs/:runId/payslip/:lineId
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/domain/derive/i18n/render";
import { fetchPayslip } from "@/web/api/payroll-api";
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
    fetchPayslip(runId, lineId)
      .then(setDto)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
          href={`/pay-runs/${runId}`}
          style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}
        >
          ← {lang === "en" ? "Back to workspace" : "Kembali ke ruang kerja"}
        </a>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              overflow: "hidden",
            }}
          >
            <button
              onClick={handleSetEn}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                fontWeight: lang === "en" ? 600 : 400,
                background: lang === "en" ? "var(--primary)" : "transparent",
                color:
                  lang === "en"
                    ? "var(--primary-foreground)"
                    : "var(--foreground)",
                border: "none",
                cursor: "pointer",
              }}
              type="button"
            >
              EN
            </button>
            <button
              onClick={handleSetMs}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                fontWeight: lang === "ms" ? 600 : 400,
                background: lang === "ms" ? "var(--primary)" : "transparent",
                color:
                  lang === "ms"
                    ? "var(--primary-foreground)"
                    : "var(--foreground)",
                border: "none",
                cursor: "pointer",
              }}
              type="button"
            >
              BM
            </button>
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
          <div style={{ color: "red", padding: "1rem" }}>Error: {error}</div>
        )}
        {dto !== null && <PayslipDocument dto={dto} lang={lang} />}
        {!(dto !== null || error !== null) && (
          <div
            style={{
              textAlign: "center",
              padding: "4rem",
              color: "var(--muted-foreground)",
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}

export { PayslipPage };
