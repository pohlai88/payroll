/**
 * The Malay dictionary.
 *
 * Typed as a total map over `MessageKey`, so omitting a key that `en.ts` defines
 * is a compile error rather than a `[missing]` string discovered on a payslip.
 */

import type { MessageKey } from "./en";

export const MS: Record<MessageKey, string> = {
  // ---- enum vocabulary ----
  "enum.EPF_PART.A": "Bahagian A",
  "enum.EPF_PART.C": "Bahagian C",
  "enum.EPF_PART.E": "Bahagian E",
  "enum.EPF_PART.F": "Bahagian F",
  "enum.EPF_PART.NONE": "tidak berkenaan",
  "enum.SOCSO_CATEGORY.FIRST": "Kategori Pertama",
  "enum.SOCSO_CATEGORY.SECOND": "Kategori Kedua",
  "enum.SOCSO_CATEGORY.NONE": "tidak berkenaan",
  "enum.PAY_BASIS.MONTHLY": "bulanan",
  "enum.PAY_BASIS.DAILY": "harian",
  "enum.PAY_BASIS.HOURLY": "sejam",
  "enum.EIS_ELIGIBILITY.ELIGIBLE": "layak",
  "enum.EIS_ELIGIBILITY.NOT_ELIGIBLE": "tidak layak",
  "enum.VERIFICATION_STATUS.VERIFIED": "disahkan",
  "enum.VERIFICATION_STATUS.UNVERIFIED": "belum disahkan",
  "enum.VERIFICATION_STATUS.NOT_ENTERED": "belum dimasukkan",

  // ---- inputs ----
  "input.dob": "Tarikh lahir",
  "input.periodEnd": "Akhir tempoh gaji",
  "input.baseRate": "Kadar gaji asas",
  "input.workingDays": "Hari bekerja dalam tempoh gaji",
  "input.paidDays": "Hari dibayar",
  "input.hoursWorked": "Jam bekerja",
  "input.otHours": "Jam kerja lebih masa",
  "input.otRate": "Kadar kerja lebih masa sejam",
  "input.itemQty": "Kuantiti {code}",
  "input.itemRate": "Kadar {code}",

  // ---- rule pack settings ----
  "setting.epf.aboveEePct": "Kadar pekerja KWSP melebihi siling jadual",
  "setting.epf.aboveErPct": "Kadar majikan KWSP melebihi siling jadual",
  "setting.epf.partFEePct": "Kadar pekerja KWSP Bahagian F",
  "setting.epf.partFErPct": "Kadar majikan KWSP Bahagian F",
  "setting.hrdf.levyPct": "Kadar levi HRD Corp",

  // ---- classification ----
  "class.age": "Umur pada akhir tempoh gaji",
  "class.age.detail": "Lahir {dob}, jadi {age} tahun genap pada {periodEnd}",
  "class.epfPart": "Bahagian Jadual Ketiga KWSP",
  "class.epfPart.detail":
    "{part}, berdasarkan umur {age} dan taraf kewarganegaraan",
  "class.epfPart.override":
    "{part}, ditetapkan secara manual dalam rekod pekerja",
  "class.epfPart.notApplicable": "KWSP tidak terpakai bagi pekerja ini",
  "class.epfPart.noAge":
    "{part}, tarikh lahir tiada dalam rekod — tiada jalur umur digunakan",
  "class.socsoCategory": "Kategori PERKESO",
  "class.socsoCategory.detail": "{category}, berdasarkan umur {age}",
  "class.socsoCategory.override":
    "{category}, ditetapkan secara manual dalam rekod pekerja",
  "class.socsoCategory.notApplicable":
    "PERKESO tidak terpakai bagi pekerja ini",
  "class.socsoCategory.noAge":
    "{category}, tarikh lahir tiada dalam rekod — tiada jalur umur digunakan",
  "class.eisEligible": "Kelayakan SIP",
  "class.eisEligible.detail":
    "{eligibility} — umur {age} berbanding julat {min}–{max}",
  "class.eisEligible.notApplicable": "SIP tidak terpakai bagi pekerja ini",
  "class.eisEligible.noAge":
    "Tidak layak — tarikh lahir tiada dalam rekod, jadi julat {min}–{max} tidak dapat digunakan",
  "class.eisEligible.age57Review":
    "Umur {age}: sejarah caruman kali pertama perlu disemak",

  // ---- earnings ----
  "earn.basic": "Gaji pokok",
  "earn.item": "{code}",
  "earn.overtime": "Kerja lebih masa",
  "earn.overtime.detail": "{hours} jam pada {rate} sejam",
  "earn.perUnit.detail": "{days} hari pada {rate} sehari",
  "earn.gross": "Gaji kasar",
  "earn.gross.detail": "Jumlah {count} pendapatan",

  // ---- proration ----
  "proration.monthly": "Pembahagian pro rata mengikut hari dibayar",
  "proration.monthly.detail": "{basic} × {paid} daripada {working} hari",
  "proration.fullMonth":
    "Bulan penuh bekerja ({paid} daripada {working} hari) — tiada pembahagian pro rata",
  "proration.daily": "{days} hari pada {rate} sehari",
  "proration.hourly": "{hours} jam pada {rate} sejam",

  // ---- wage bases ----
  "wages.epf": "Upah tertakluk kepada KWSP",
  "wages.socso": "Upah tertakluk kepada PERKESO",
  "wages.eis": "Upah tertakluk kepada SIP",
  "wages.excluded.byMatrix":
    "{code} tidak dikira sebagai upah bagi caruman ini",

  // ---- EPF ----
  "epf.band": "Jadual Ketiga KWSP, {part}",
  "epf.band.matched":
    "Upah {wages} berada dalam banjaran {from}–{to}, baris {row} daripada {rows}",
  "epf.ee": "Caruman pekerja KWSP",
  "epf.er": "Caruman majikan KWSP",
  "epf.column": "Lajur pekerja bagi banjaran yang sepadan",
  "epf.columnEr": "Lajur majikan bagi banjaran yang sepadan",
  "epf.above.ee": "Caruman pekerja KWSP melebihi siling jadual",
  "epf.above.er": "Caruman majikan KWSP melebihi siling jadual",
  "epf.above.detail":
    "Upah {wages} melebihi siling jadual {ceiling}, jadi {pct} dikenakan",
  "epf.partF.detail": "Kadar tetap Bahagian F sebanyak {pct}",
  "epf.na.part": "KWSP tidak berkenaan bagi pekerja ini",
  "epf.na.noWages": "Tiada upah tertakluk kepada KWSP",

  // ---- SOCSO ----
  "socso.band": "Jadual caruman PERKESO, Akta 4",
  "socso.band.matched":
    "Upah {wages} berada dalam banjaran {from}–{to}, baris {row} daripada {rows}",
  "socso.er": "Caruman majikan PERKESO",
  "socso.eeCore": "Caruman pekerja PERKESO",
  "socso.eeSkbbk": "Caruman pekerja SKBBK",
  "socso.skbbk.window": "Fasa SKBBK berkuat kuasa",
  "socso.skbbk.inWindow": "{periodEnd} berada dalam fasa {from} hingga {to}",
  "socso.skbbk.outsideWindow":
    "{periodEnd} berada di luar fasa {from} hingga {to}",
  "socso.column": "Lajur {category} bagi banjaran yang sepadan",
  "socso.na.category": "PERKESO tidak berkenaan bagi pekerja ini",
  "socso.na.noWages": "Tiada upah tertakluk kepada PERKESO",

  // ---- EIS ----
  "eis.band": "Jadual caruman SIP, Akta 800",
  "eis.band.matched":
    "Upah {wages} berada dalam banjaran {from}–{to}, baris {row} daripada {rows}",
  "eis.ee": "Caruman pekerja SIP",
  "eis.er": "Caruman majikan SIP",
  "eis.na.notEligible": "SIP tidak berkenaan bagi pekerja ini",
  "eis.na.noWages": "Tiada upah tertakluk kepada SIP",

  // ---- PCB ----
  "pcb.declared": "PCB / MTD seperti direkodkan",
  "pcb.declared.notEntered":
    "Belum dimasukkan — gaji bersih tidak dapat ditentukan",
  "pcb.declared.entered": "Direkodkan daripada {source}, {status}",
  "pcb.declared.computed":
    "Dikira daripada spesifikasi PCB berkomputer LHDN 2026 ({source})",
  "pcb.y1": "Saraan biasa bulan semasa (Y1)",
  "pcb.k1": "KWSP bulan semasa terhadap Y1 (K1)",
  "pcb.zakat": "Tolakan zakat",
  "pcb.net": "PCB / MTD selepas zakat",
  "pcb.net.detail":
    "Nilai yang lebih tinggi antara PCB tolak zakat {zakat}, dan sifar",
  "pcb.cp38": "Ansuran CP38",
  "pcb.na": "PCB tidak berkenaan bagi pekerja ini",

  // ---- rounding ----
  "round.halfUp.detail": "{exact} dibundarkan kepada {result}",
  "round.ceilRinggit.detail":
    "{exact} dibundarkan ke atas kepada {result}, perbezaan sebanyak {delta}",
  "round.noChange": "Tiada pembundaran diperlukan",

  // ---- overrides ----
  "override.applied": "Pindaan manual",
  "override.detail": "Dikira {computed}, dipinda kepada {override} — {reason}",

  // ---- totals ----
  "total.statutoryEe": "Potongan berkanun pekerja",
  "total.otherDeductions": "Potongan lain",
  "total.otherDeductions.none": "Tiada potongan lain direkodkan",
  "total.deductions": "Jumlah potongan",
  "total.deductions.pendingPcb":
    "Tidak dapat ditentukan sehingga PCB dimasukkan",
  "total.net": "Gaji bersih",
  "total.net.detail": "Gaji kasar {gross} tolak potongan {deductions}",
  "total.net.pendingPcb": "Tidak dapat ditentukan sehingga PCB dimasukkan",
  "total.hrdf": "Levi HRD Corp",
  "total.hrdf.detail": "{pct} daripada upah tertakluk kepada KWSP",
  "total.hrdf.disabled": "Syarikat tidak berdaftar untuk levi HRD Corp",
  "total.employerCost": "Jumlah kos kepada majikan",
  "total.employerCost.detail": "Gaji kasar campur caruman majikan dan levi",

  // ---- generic operations ----
  "op.sum": "Jumlah",
  "op.percent": "{pct} daripada {base}",

  // Phase 8 — payslip document section labels
  "doc.payslip.title": "PENYATA GAJI",
  "doc.payslip.earnings": "PENDAPATAN",
  "doc.payslip.deductions": "POTONGAN",
  "doc.payslip.employer-contributions": "SUMBANGAN MAJIKAN",
  "doc.payslip.net-pay": "GAJI BERSIH",
  "doc.payslip.ytd": "TAHUN SEMASA",
  "doc.payslip.ytd-provisional": "TAHUN SEMASA (SEMENTARA)",
  "doc.payslip.statutory-wages": "GAJI BERKANUN",
  "doc.payslip.audit-annex": "LAMPIRAN AUDIT",
  "doc.payslip.employer-note":
    "Sumbangan majikan \u2014 tidak ditolak daripada gaji anda.",
  "doc.payslip.preview-watermark": "PRATONTON \u2014 TIDAK DIKELUARKAN",
  "doc.payslip.employer-source-warning":
    "Identiti majikan diambil daripada rekod syarikat semasa \u2014 bukan rekod syarikat masa gaji diproses.",
};
