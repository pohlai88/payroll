/**
 * DB operations for the employee bulk importer. Create-only: nothing here
 * ever updates an existing person/employment/profile row — see
 * docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  employeeCustomFieldDefs,
  employmentProfiles,
} from "@/db/schema/employee-profile";
import { companies, employments, persons } from "@/db/schema/parties";
import type { ParsedEmployeeRow } from "@/domain/import/employee-row";

export async function findCompanyIdByCode(
  db: Database,
  code: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.code, code))
    .limit(1);
  return row?.id ?? null;
}

export async function findExistingEmploymentId(
  db: Database,
  companyId: string,
  employeeCode: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: employments.id })
    .from(employments)
    .where(
      and(
        eq(employments.companyId, companyId),
        eq(employments.employeeCode, employeeCode)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

export async function listActiveCustomFieldDefs(
  db: Database
): Promise<(typeof employeeCustomFieldDefs.$inferSelect)[]> {
  return await db
    .select()
    .from(employeeCustomFieldDefs)
    .where(eq(employeeCustomFieldDefs.active, true))
    .orderBy(employeeCustomFieldDefs.sortOrder);
}

/**
 * Creates person (or reuses one matched by IC) + employment + profile inside
 * one transaction. The caller (`service/employee-import.ts`) has already
 * confirmed no employment exists for this `(companyId, employeeCode)` — this
 * function does not re-check, so it must only ever be called from the
 * create-only import path.
 */
export async function createEmployeeFromImport(
  db: Database,
  companyId: string,
  row: ParsedEmployeeRow
): Promise<{ personId: string; employmentId: string }> {
  return await db.transaction(async (tx) => {
    let personId: string | null = null;

    if (row.personIc !== null) {
      const [existing] = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.ic, row.personIc))
        .limit(1);
      personId = existing?.id ?? null;
    }

    if (personId === null) {
      const [created] = await tx
        .insert(persons)
        .values({
          name: row.personName,
          ic: row.personIc,
          passport: row.personPassport,
          dob: row.personDob,
          nationality: row.personNationality,
        })
        .returning({ id: persons.id });
      if (created === undefined) {
        throw new Error(
          "createEmployeeFromImport: person insert returned no row"
        );
      }
      personId = created.id;
    }

    const [employment] = await tx
      .insert(employments)
      .values({
        personId,
        companyId,
        employeeCode: row.employeeCode,
        joinDate: row.joinDate,
        payBasis: row.payBasis,
        baseRateSen: row.baseRateSen,
        isMalaysian: row.isMalaysian,
        isPermanentResident: row.isPermanentResident,
        epfApplicable: row.epfApplicable,
        socsoApplicable: row.socsoApplicable,
        eisApplicable: row.eisApplicable,
        pcbApplicable: row.pcbApplicable,
        epfNo: row.epfNo,
        socsoNo: row.socsoNo,
        tin: row.tin,
        bankName: row.bankName,
        bankAccountNo: row.bankAccountNo,
      })
      .returning({ id: employments.id });
    if (employment === undefined) {
      throw new Error(
        "createEmployeeFromImport: employment insert returned no row"
      );
    }

    await tx.insert(employmentProfiles).values({
      employmentId: employment.id,
      jobTitle: row.profile.jobTitle,
      department: row.profile.department,
      superiorName: row.profile.superiorName,
      gender: row.profile.gender,
      race: row.profile.race,
      religion: row.profile.religion,
      maritalStatus: row.profile.maritalStatus,
      email: row.profile.email,
      mobileNo: row.profile.mobileNo,
      phoneNo: row.profile.phoneNo,
      addressLine: row.profile.addressLine,
      city: row.profile.city,
      state: row.profile.state,
      postalCode: row.profile.postalCode,
      country: row.profile.country,
      paymentMethod: row.profile.paymentMethod,
      finalCompanyCode: row.profile.finalCompanyCode,
      masterPrimaryCompanyCode: row.profile.masterPrimaryCompanyCode,
      payrollNotes: row.profile.payrollNotes,
      importSourceNotes: row.profile.importSourceNotes,
      extraAttributes: row.extraAttributes,
    });

    return { personId, employmentId: employment.id };
  });
}
