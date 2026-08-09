/**
 * @feature companies
 * @layer ui
 * @hub src/server/routes/admin-companies.ts
 *
 * form-layout-01 — Clarity company party fields.
 */

import type { SubmitEvent } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminCompanyRow, CreateAdminCompanyBody } from "@/web/api/types";

export type CompanyFormValues = CreateAdminCompanyBody;

interface CompanyFormProps {
  readonly initial?: AdminCompanyRow | null;
  readonly busy?: boolean;
  readonly submitLabel?: string;
  readonly onSubmit: (values: CompanyFormValues) => void | Promise<void>;
  readonly onCancel?: () => void;
}

function CompanyForm({
  initial = null,
  busy = false,
  submitLabel = "Save company",
  onSubmit,
  onCancel,
}: CompanyFormProps) {
  const isEdit = initial !== null;
  const [hrdfEnabled, setHrdfEnabled] = useState(initial?.hrdfEnabled ?? false);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const code = String(form.get("code") ?? "").trim();
      const name = String(form.get("name") ?? "").trim();
      const epfNo = String(form.get("epfNo") ?? "").trim();
      const socsoNo = String(form.get("socsoNo") ?? "").trim();
      const lhdnNo = String(form.get("lhdnNo") ?? "").trim();
      const hrdfLevyPct = String(form.get("hrdfLevyPct") ?? "1").trim();

      onSubmit({
        code: isEdit ? (initial?.code ?? code) : code,
        name,
        epfNo: epfNo === "" ? null : epfNo,
        socsoNo: socsoNo === "" ? null : socsoNo,
        lhdnNo: lhdnNo === "" ? null : lhdnNo,
        hrdfEnabled,
        hrdfLevyPct: hrdfLevyPct === "" ? "1" : hrdfLevyPct,
      });
    },
    [hrdfEnabled, initial, isEdit, onSubmit]
  );

  const handleHrdfCheckedChange = useCallback(
    (checked: boolean | "indeterminate") => {
      setHrdfEnabled(checked === true);
    },
    []
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-8 space-y-2">
        <h2 className="font-semibold text-xl">
          {isEdit ? "Edit company" : "New company"}
        </h2>
        <p className="text-muted-foreground text-sm">
          Payroll company code matches employee import (`Payroll Company Code`)
          and scopes pay runs across the group.
        </p>
      </div>

      <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field className="gap-2">
          <FieldLabel htmlFor="company-code">Company code</FieldLabel>
          <Input
            defaultValue={initial?.code ?? ""}
            disabled={isEdit || busy}
            id="company-code"
            name="code"
            placeholder="DLBB"
            required={!isEdit}
          />
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="company-name">Legal name</FieldLabel>
          <Input
            defaultValue={initial?.name ?? ""}
            disabled={busy}
            id="company-name"
            name="name"
            placeholder="DLBB Sdn Bhd"
            required
          />
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="company-epf">EPF employer no.</FieldLabel>
          <Input
            defaultValue={initial?.epfNo ?? ""}
            disabled={busy}
            id="company-epf"
            name="epfNo"
            placeholder="Optional"
          />
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="company-socso">SOCSO employer no.</FieldLabel>
          <Input
            defaultValue={initial?.socsoNo ?? ""}
            disabled={busy}
            id="company-socso"
            name="socsoNo"
            placeholder="Optional"
          />
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="company-lhdn">LHDN E-number</FieldLabel>
          <Input
            defaultValue={initial?.lhdnNo ?? ""}
            disabled={busy}
            id="company-lhdn"
            name="lhdnNo"
            placeholder="Optional"
          />
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="company-hrdf-levy">HRDF levy %</FieldLabel>
          <Input
            defaultValue={initial?.hrdfLevyPct ?? "1"}
            disabled={busy}
            id="company-hrdf-levy"
            name="hrdfLevyPct"
            placeholder="1"
          />
        </Field>

        <Field className="flex flex-row items-center gap-2 sm:col-span-2">
          <Checkbox
            checked={hrdfEnabled}
            disabled={busy}
            id="company-hrdf"
            onCheckedChange={handleHrdfCheckedChange}
          />
          <FieldLabel htmlFor="company-hrdf">HRDF enabled</FieldLabel>
        </Field>
      </FieldGroup>

      <div className="mt-8 flex justify-end gap-2">
        {onCancel === undefined ? null : (
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        )}
        <Button disabled={busy} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default CompanyForm;
