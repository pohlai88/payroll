/**
 * @feature treatments
 * @layer ui
 * @hub src/server/routes/treatments.ts
 *
 * Governed pay-item wage-treatment / PCB-class APPROVED_DEPARTURE writes.
 * Studio DNA: form-layout-01 (section + two-column field grid).
 * No pay-item directory API — operators enter the catalog UUID.
 */

import { ScaleIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
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
import { Textarea } from "@/components/ui/textarea";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import { PageTitle } from "@/web/shell/page-title";

type WageScheme = "EPF" | "SOCSO" | "EIS" | "HRD";
type PcbClass = "NORMAL" | "ADDITIONAL" | "EXCLUDED";

function TreatmentsPage() {
  const [error, setError] = useState<string | null>(null);
  const [wageBusy, setWageBusy] = useState(false);
  const [pcbBusy, setPcbBusy] = useState(false);
  const [wageId, setWageId] = useState<string | null>(null);
  const [pcbId, setPcbId] = useState<string | null>(null);

  const [wagePayItemId, setWagePayItemId] = useState("");
  const [scheme, setScheme] = useState<WageScheme>("EPF");
  const [subject, setSubject] = useState(true);
  const [wageFrom, setWageFrom] = useState("");
  const [wageReason, setWageReason] = useState("");
  const [wageApprovedBy, setWageApprovedBy] = useState("");

  const [pcbPayItemId, setPcbPayItemId] = useState("");
  const [pcbClass, setPcbClass] = useState<PcbClass>("NORMAL");
  const [pcbFrom, setPcbFrom] = useState("");
  const [pcbReason, setPcbReason] = useState("");
  const [pcbApprovedBy, setPcbApprovedBy] = useState("");

  const onWagePayItem = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setWagePayItemId(e.currentTarget.value);
  }, []);
  const onWageFrom = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setWageFrom(e.currentTarget.value);
  }, []);
  const onWageReason = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setWageReason(e.currentTarget.value);
  }, []);
  const onWageApproved = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setWageApprovedBy(e.currentTarget.value);
  }, []);
  const onPcbPayItem = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPcbPayItemId(e.currentTarget.value);
  }, []);
  const onPcbFrom = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPcbFrom(e.currentTarget.value);
  }, []);
  const onPcbReason = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setPcbReason(e.currentTarget.value);
  }, []);
  const onPcbApproved = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPcbApprovedBy(e.currentTarget.value);
  }, []);

  const submitWage = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setWageBusy(true);
      setError(null);
      setWageId(null);
      try {
        const response = await payrollApi.recordWageTreatmentDeparture(
          wagePayItemId.trim(),
          {
            scheme,
            subject,
            effectiveFrom: wageFrom,
            reason: wageReason.trim(),
            approvedBy: wageApprovedBy.trim(),
          }
        );
        setWageId(response.id);
      } catch (cause) {
        setError(formatApiError(cause, "Wage departure failed"));
      } finally {
        setWageBusy(false);
      }
    },
    [scheme, subject, wageApprovedBy, wageFrom, wagePayItemId, wageReason]
  );

  const submitPcb = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setPcbBusy(true);
      setError(null);
      setPcbId(null);
      try {
        const response = await payrollApi.recordPcbClassDeparture(
          pcbPayItemId.trim(),
          {
            class: pcbClass,
            effectiveFrom: pcbFrom,
            reason: pcbReason.trim(),
            approvedBy: pcbApprovedBy.trim(),
          }
        );
        setPcbId(response.id);
      } catch (cause) {
        setError(formatApiError(cause, "PCB departure failed"));
      } finally {
        setPcbBusy(false);
      }
    },
    [pcbApprovedBy, pcbClass, pcbFrom, pcbPayItemId, pcbReason]
  );

  return (
    <div className="space-y-6">
      <PageTitle
        description="Record approved departures from catalog wage treatments and PCB classes."
        title="Treatments"
      />

      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScaleIcon className="size-4" />
            Wage treatment departure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={submitWage}>
            <div className="space-y-2">
              <h2 className="font-semibold text-xl">Scheme override</h2>
              <p className="text-muted-foreground text-sm">
                Writes an APPROVED_DEPARTURE for EPF / SOCSO / EIS / HRD on a
                pay item. Enter the catalog pay-item UUID.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="wage-item">Pay item id</Label>
                <Input
                  id="wage-item"
                  onChange={onWagePayItem}
                  placeholder="UUID"
                  required
                  value={wagePayItemId}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Scheme</Label>
                <Select
                  onValueChange={(v) => setScheme((v as WageScheme) ?? "EPF")}
                  value={scheme}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["EPF", "SOCSO", "EIS", "HRD"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="wage-from">Effective from</Label>
                <Input
                  id="wage-from"
                  onChange={onWageFrom}
                  required
                  type="date"
                  value={wageFrom}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  checked={subject}
                  id="wage-subject"
                  onCheckedChange={(checked) => setSubject(checked === true)}
                />
                <Label htmlFor="wage-subject">Subject to scheme</Label>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="wage-reason">Reason</Label>
                <Textarea
                  id="wage-reason"
                  onChange={onWageReason}
                  required
                  rows={3}
                  value={wageReason}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="wage-approved">Approved by</Label>
                <Input
                  id="wage-approved"
                  onChange={onWageApproved}
                  required
                  value={wageApprovedBy}
                />
              </div>
            </div>

            {wageId === null ? null : (
              <p className="text-muted-foreground text-sm" role="status">
                Departure recorded: {wageId}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                disabled={
                  wageBusy ||
                  wagePayItemId.trim() === "" ||
                  wageFrom === "" ||
                  wageReason.trim() === "" ||
                  wageApprovedBy.trim() === ""
                }
                type="submit"
              >
                {wageBusy ? "Saving…" : "Record wage departure"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">PCB class departure</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={submitPcb}>
            <div className="space-y-2">
              <h2 className="font-semibold text-xl">PCB class override</h2>
              <p className="text-muted-foreground text-sm">
                Writes an APPROVED_DEPARTURE for NORMAL / ADDITIONAL / EXCLUDED.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pcb-item">Pay item id</Label>
                <Input
                  id="pcb-item"
                  onChange={onPcbPayItem}
                  placeholder="UUID"
                  required
                  value={pcbPayItemId}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Class</Label>
                <Select
                  onValueChange={(v) =>
                    setPcbClass((v as PcbClass) ?? "NORMAL")
                  }
                  value={pcbClass}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["NORMAL", "ADDITIONAL", "EXCLUDED"] as const).map(
                      (c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pcb-from">Effective from</Label>
                <Input
                  id="pcb-from"
                  onChange={onPcbFrom}
                  required
                  type="date"
                  value={pcbFrom}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pcb-reason">Reason</Label>
                <Textarea
                  id="pcb-reason"
                  onChange={onPcbReason}
                  required
                  rows={3}
                  value={pcbReason}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pcb-approved">Approved by</Label>
                <Input
                  id="pcb-approved"
                  onChange={onPcbApproved}
                  required
                  value={pcbApprovedBy}
                />
              </div>
            </div>

            {pcbId === null ? null : (
              <p className="text-muted-foreground text-sm" role="status">
                Departure recorded: {pcbId}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                disabled={
                  pcbBusy ||
                  pcbPayItemId.trim() === "" ||
                  pcbFrom === "" ||
                  pcbReason.trim() === "" ||
                  pcbApprovedBy.trim() === ""
                }
                type="submit"
              >
                {pcbBusy ? "Saving…" : "Record PCB departure"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export { TreatmentsPage };
