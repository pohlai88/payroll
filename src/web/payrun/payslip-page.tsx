/**
 * @feature payslip
 * @layer ui
 * @hub src/server/routes/pay-run-payslip.ts
 *
 * Full-page bilingual payslip — /pay-runs/:runId/payslip/:lineId
 * Chrome only (action bar + loading); document grammar stays in
 * `payslip-document/`. Uses `getPayslipIndex` for prev/next.
 */
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lang } from "@/domain/derive/i18n/render";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import { PayslipDocument } from "./payslip-document/payslip-document";
import type {
  PayslipDocumentDto,
  PayslipIndexRow,
} from "./payslip-document/types";

function PayslipPage() {
  const { runId, lineId } = useParams<{ runId: string; lineId: string }>();
  const [, navigate] = useLocation();
  const [dto, setDto] = useState<PayslipDocumentDto | null>(null);
  const [index, setIndex] = useState<readonly PayslipIndexRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    if (!(runId && lineId)) {
      return;
    }
    setDto(null);
    setError(null);
    payrollApi
      .getPayslip(runId, lineId)
      .then(setDto)
      .catch((e) => setError(formatApiError(e, "Failed to load payslip")));
  }, [runId, lineId]);

  useEffect(() => {
    if (runId === undefined) {
      return;
    }
    let cancelled = false;
    payrollApi
      .getPayslipIndex(runId)
      .then((result) => {
        if (!cancelled) {
          setIndex(result.payslips);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIndex([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const position = useMemo(() => {
    if (index === null || lineId === undefined) {
      return { prev: null as string | null, next: null as string | null };
    }
    const i = index.findIndex((row) => row.lineId === lineId);
    if (i < 0) {
      return { prev: null, next: null };
    }
    return {
      prev: i > 0 ? (index[i - 1]?.lineId ?? null) : null,
      next: i < index.length - 1 ? (index[i + 1]?.lineId ?? null) : null,
    };
  }, [index, lineId]);

  const handleSetEn = useCallback(() => setLang("en"), []);
  const handleSetMs = useCallback(() => setLang("ms"), []);
  const handlePrint = useCallback(() => window.print(), []);
  const goPrev = useCallback(() => {
    if (runId === undefined || position.prev === null) {
      return;
    }
    navigate(`/pay-runs/${runId}/payslip/${position.prev}`);
  }, [navigate, position.prev, runId]);
  const goNext = useCallback(() => {
    if (runId === undefined || position.next === null) {
      return;
    }
    navigate(`/pay-runs/${runId}/payslip/${position.next}`);
  }, [navigate, position.next, runId]);

  return (
    <div className="min-h-dvh bg-[var(--doc-fill-header)]">
      {/* Actions bar — hidden during print */}
      <div
        className="payslip-actions flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6"
        data-no-print
      >
        <Button
          render={<Link href={`/pay-runs/${runId}`} />}
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
          {lang === "en" ? "Back to workspace" : "Kembali ke ruang kerja"}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            disabled={position.prev === null}
            onClick={goPrev}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronLeftIcon className="size-4" />
            {lang === "en" ? "Prev" : "Sebelum"}
          </Button>
          <Button
            disabled={position.next === null}
            onClick={goNext}
            size="sm"
            type="button"
            variant="outline"
          >
            {lang === "en" ? "Next" : "Seterusnya"}
            <ChevronRightIcon className="size-4" />
          </Button>
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
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
            <PrinterIcon className="size-4" />
            {lang === "en" ? "Print" : "Cetak"}
          </Button>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {error === null ? null : (
          <Alert className="mx-auto max-w-3xl" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {dto === null ? null : <PayslipDocument dto={dto} lang={lang} />}
        {dto === null && error === null ? (
          <div className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { PayslipPage };
