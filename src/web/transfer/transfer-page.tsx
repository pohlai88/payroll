/**
 * @feature transfer
 * @layer ui
 * @hub src/server/routes/transfers.ts
 *
 * Internal group employment transfer — commit + finding acknowledge.
 * Studio DNA: form-layout-01 (section + two-column field grid).
 */

import { ArrowLeftRightIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type {
  CommitTransferResponse,
  EmployeeSummary,
} from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";

function TransferPage() {
  const { me, loading: authLoading } = useAuthContext();
  const [employees, setEmployees] = useState<readonly EmployeeSummary[] | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommitTransferResponse | null>(null);

  const [fromEmploymentId, setFromEmploymentId] = useState("");
  const [toCompanyId, setToCompanyId] = useState("");
  const [toEmployeeCode, setToEmployeeCode] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [continuity, setContinuity] = useState<"CONTINUOUS" | "RESET">(
    "CONTINUOUS"
  );
  const [continuityReason, setContinuityReason] = useState("");
  const [leaveNote, setLeaveNote] = useState("");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [overlapReason, setOverlapReason] = useState("");

  const [findingId, setFindingId] = useState("");
  const [findingNote, setFindingNote] = useState("");
  const [ackBusy, setAckBusy] = useState(false);
  const [ackOk, setAckOk] = useState(false);

  const companies = me?.companies ?? [];

  useEffect(() => {
    let cancelled = false;
    payrollApi
      .getEmployees()
      .then((rows) => {
        if (!cancelled) {
          setEmployees(rows);
          setLoadError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(formatApiError(cause, "Failed to load employees"));
          setEmployees([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e) => e.status === "ACTIVE"),
    [employees]
  );

  const selected = useMemo(
    () => activeEmployees.find((e) => e.id === fromEmploymentId) ?? null,
    [activeEmployees, fromEmploymentId]
  );

  const destinationCompanies = useMemo(() => {
    if (selected === null) {
      return companies;
    }
    return companies.filter((c) => c.id !== selected.companyId);
  }, [companies, selected]);

  const onCode = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setToEmployeeCode(e.currentTarget.value);
  }, []);
  const onDate = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEffectiveDate(e.currentTarget.value);
  }, []);
  const onContinuityReason = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setContinuityReason(e.currentTarget.value);
  }, []);
  const onLeaveNote = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setLeaveNote(e.currentTarget.value);
  }, []);
  const onOverlapReason = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setOverlapReason(e.currentTarget.value);
  }, []);
  const onFindingId = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setFindingId(e.currentTarget.value);
  }, []);
  const onFindingNote = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setFindingNote(e.currentTarget.value);
  }, []);

  const submitTransfer = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (selected === null) {
        setError("Select an active employment to transfer from.");
        return;
      }
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const response = await payrollApi.commitTransfer({
          personId: selected.personId,
          fromEmploymentId: selected.id,
          effectiveDate,
          toCompanyId,
          toEmployeeCode: toEmployeeCode.trim(),
          groupServiceContinuity: continuity,
          continuityReason:
            continuityReason.trim() === "" ? null : continuityReason.trim(),
          leaveBenefitTreatmentNote:
            leaveNote.trim() === "" ? null : leaveNote.trim(),
          allowOverlap,
          overlapReason:
            overlapReason.trim() === "" ? null : overlapReason.trim(),
        });
        setResult(response);
      } catch (cause) {
        setError(formatApiError(cause, "Transfer commit failed"));
      } finally {
        setBusy(false);
      }
    },
    [
      allowOverlap,
      continuity,
      continuityReason,
      effectiveDate,
      leaveNote,
      overlapReason,
      selected,
      toCompanyId,
      toEmployeeCode,
    ]
  );

  const submitAck = useCallback(async () => {
    setAckBusy(true);
    setError(null);
    setAckOk(false);
    try {
      await payrollApi.acknowledgeTransferFinding(
        findingId.trim(),
        findingNote.trim() === "" ? undefined : findingNote.trim()
      );
      setAckOk(true);
    } catch (cause) {
      setError(formatApiError(cause, "Acknowledge failed"));
    } finally {
      setAckBusy(false);
    }
  }, [findingId, findingNote]);

  if (authLoading || employees === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        description="Commit an internal group employment transfer and acknowledge transfer findings."
        title="Transfers"
      />

      {loadError === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {loadError}
        </p>
      )}
      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {result === null ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          Transfer {result.transferId} → employment {result.toEmploymentId}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRightIcon className="size-4" />
            Commit transfer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={submitTransfer}>
            <div className="space-y-2">
              <h2 className="font-semibold text-xl">Employment move</h2>
              <p className="text-muted-foreground text-sm">
                Source employment ends; a new employment opens at the destination
                company on the effective date.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label>From employment</Label>
                <Select
                  onValueChange={(v) => setFromEmploymentId(v ?? "")}
                  value={fromEmploymentId === "" ? null : fromEmploymentId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select active employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.code} — {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label>To company</Label>
                <Select
                  onValueChange={(v) => setToCompanyId(v ?? "")}
                  value={toCompanyId === "" ? null : toCompanyId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Destination company" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="to-code">New employee code</Label>
                <Input
                  id="to-code"
                  onChange={onCode}
                  required
                  value={toEmployeeCode}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="eff-date">Effective date</Label>
                <Input
                  id="eff-date"
                  onChange={onDate}
                  required
                  type="date"
                  value={effectiveDate}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Group service continuity</Label>
                <Select
                  onValueChange={(v) =>
                    setContinuity((v as "CONTINUOUS" | "RESET") ?? "CONTINUOUS")
                  }
                  value={continuity}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONTINUOUS">CONTINUOUS</SelectItem>
                    <SelectItem value="RESET">RESET</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="cont-reason">Continuity reason</Label>
                <Input
                  id="cont-reason"
                  onChange={onContinuityReason}
                  value={continuityReason}
                />
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="leave-note">Leave / benefit note</Label>
                <Textarea
                  id="leave-note"
                  onChange={onLeaveNote}
                  rows={3}
                  value={leaveNote}
                />
              </div>

              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  checked={allowOverlap}
                  id="allow-overlap"
                  onCheckedChange={(checked) =>
                    setAllowOverlap(checked === true)
                  }
                />
                <Label htmlFor="allow-overlap">Allow employment overlap</Label>
              </div>

              {allowOverlap ? (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="overlap-reason">Overlap reason</Label>
                  <Input
                    id="overlap-reason"
                    onChange={onOverlapReason}
                    value={overlapReason}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                disabled={
                  busy ||
                  selected === null ||
                  toCompanyId === "" ||
                  toEmployeeCode.trim() === "" ||
                  effectiveDate === "" ||
                  (allowOverlap && overlapReason.trim() === "")
                }
                type="submit"
              >
                {busy ? "Committing…" : "Commit transfer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acknowledge finding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="finding-id">Finding id</Label>
              <Input
                id="finding-id"
                onChange={onFindingId}
                placeholder="UUID"
                value={findingId}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="finding-note">Note (optional)</Label>
              <Textarea
                id="finding-note"
                onChange={onFindingNote}
                rows={2}
                value={findingNote}
              />
            </div>
          </div>
          {ackOk ? (
            <p className="text-muted-foreground text-sm" role="status">
              Finding acknowledged.
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              disabled={ackBusy || findingId.trim() === ""}
              onClick={submitAck}
              type="button"
              variant="outline"
            >
              {ackBusy ? "Saving…" : "Acknowledge"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export { TransferPage };
