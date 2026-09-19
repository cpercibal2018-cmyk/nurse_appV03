#!/usr/bin/env python3
"""Amendment 2.8.7c — employee record shape and contract guards (F-33…F-38).

The implementation shipped an employee record this specification did not
describe: a single `p_name` column, no HR attributes, no Hijri contract dates,
and contract guards that lived only inside one screen. This pass brings §3.1
and §4.2 in line with what is built, tested and enforced.

  F-33  Job Number carries no format rule (plain number or text+number)
  F-34  Employee record: First/Middle/Last with a derived Full Name, plus the
        nine HR attributes, in the onboarding form's order
  F-35  fn_onboard_employee_with_contract takes the new record shape (V50)
  F-36  Contract Start/End are required and stored in both calendars
        (Gregorian authoritative, Umm al-Qura recorded alongside)
  F-37  Contract guards belong to the service layer, not to a screen
  F-38  Create Contract appends the dates entered at onboarding

Asserts uniqueness of every match; aborts without writing on any mismatch.
"""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))

DOC = ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'
text = DOC.read_text(encoding='utf-8')
patches = []


def P(name, old, new, count=1):
    patches.append((name, old, new, count))


# ------------------------------------------------------------------ header
P("HDR-2.8.7c",
  "2.8.7b — backup/restore script corrections (closes review finding F-23)",
  "2.8.7b — backup/restore script corrections (closes review finding F-23); "
  "2.8.7c — employee record shape: no Job Number format rule, First/Middle/Last with a "
  "derived Full Name, HR attributes, required Hijri contract dates, contract guards in the "
  "service layer (closes review findings F-33–F-38)")

# ------------------------------------------------------------------ F-33 workflow step
P("F33-workflow-step2",
  "2. HR enters a unique Job Number, employee name, organizational placement, position, contact email and contract terms.",
  "2. HR enters the employee record: First Name, Middle Name and Last Name — **Full Name is "
  "derived from the three parts, never typed** — then, in this order: Job Number (unique; "
  "**no format rule**, a plain number or a text-and-number combination are both accepted), "
  "Job Title, File No., Rank/Grade, Nationality, Job Post (Location Assignment — City), "
  "Actual Work Place, Specialty, Contract Start and Contract End (both required; entered as "
  "Gregorian dates with the Umm al-Qura Hijri equivalent converted and stored alongside), "
  "Marital Status and Salary in Saudi Riyals — plus organizational placement, position and "
  "contact email.")

# ------------------------------------------------------------------ F-34 record shape
P("F34-employee-record",
  "**Implementation — database gatekeeper (V36):**",
  """**Employee record (2.8.7c).** The onboarding form and the `employees` table carry the fields below. **Full Name is derived, never entered:** a trigger recomposes it from First + Middle + Last on every write, so the stored value cannot drift from its parts and an omitted Middle Name leaves no double space.

| # | Field | Column | Rule |
| :--- | :--- | :--- | :--- |
| 1 | First Name | `first_name` | Required |
| 2 | Middle Name | `middle_name` | Optional |
| 3 | Last Name | `last_name` | Required |
| — | Full Name | `full_name` | **Derived** by `trg_employees_compose_full_name` = First + Middle + Last. Never supplied by a caller; a generated column is rejected because the ORM writes `full_name` explicitly and PostgreSQL refuses writes to generated columns. |
| 4 | Job Number | `job_number` | Required, unique. **No format rule** — a plain number (`1001`) or a text-and-number combination (`AIGH1002`, `EMP2004`) are both valid. The retired `AIGH-XXXX` pattern is neither required nor enforced, and no `CHECK` constraint may reintroduce it. |
| 5 | Job Title | `job_title` | — |
| 6 | File No. | `file_no` | Personnel-file reference. Not constrained unique; HR may leave it blank. |
| 7 | Rank/Grade | `rank_grade` | — |
| 8 | Nationality | `nationality` | — |
| 9 | Job Post (Location Assignment) — City | `job_post_location` | — |
| 10 | Actual Work Place | `actual_work_place` | — |
| 11 | Specialty | `specialty` | — |
| 12 | Contract Start | `contracts.start_date` + `start_date_hijri` | Required. Gregorian entry; the Umm al-Qura equivalent is converted and stored with it. |
| 13 | Contract End | `contracts.end_date` + `end_date_hijri` | Required, strictly after the start. Same conversion. |
| 14 | Marital Status | `marital_status` | `Single` / `Married` / `Others` |
| 15 | Salary | `salary` | Amount in Saudi Riyals, `NUMERIC(12,2)`, non-negative |

Fields 4–15 appear in this order on the onboarding form. Schema: `prisma/migrations/V50_employee_hr_fields.sql`.

**Implementation — database gatekeeper (V36):**""")

# ------------------------------------------------------------------ F-35 function signature
P("F35-fn-signature",
  """CREATE OR REPLACE FUNCTION fn_onboard_employee_with_contract(
    p_name VARCHAR,
    p_job_number VARCHAR,
    p_unit_id INTEGER,
    p_position VARCHAR,
    p_contact_email VARCHAR,
    p_contract_start DATE,
    p_contract_end DATE,
    p_actor_id INTEGER
) RETURNS INTEGER AS $$""",
  """CREATE OR REPLACE FUNCTION fn_onboard_employee_with_contract(
    -- Name parts. full_name is NOT a parameter: the trigger derives it (2.8.7c).
    p_first_name VARCHAR,
    p_middle_name VARCHAR,
    p_last_name VARCHAR,
    -- No format rule applies to the job number: plain number or text+number (2.8.7c).
    p_job_number VARCHAR,
    p_job_title VARCHAR,
    p_file_no VARCHAR,
    p_rank_grade VARCHAR,
    p_nationality VARCHAR,
    p_job_post_location VARCHAR,
    p_actual_work_place VARCHAR,
    p_specialty VARCHAR,
    p_marital_status VARCHAR,
    p_salary NUMERIC,
    p_unit_id INTEGER,
    p_position VARCHAR,
    p_contact_email VARCHAR,
    p_contract_start DATE,
    p_contract_end DATE,
    -- Umm al-Qura equivalents, converted by the caller and stored as entered (2.8.7c).
    p_contract_start_hijri VARCHAR,
    p_contract_end_hijri VARCHAR,
    p_actor_id INTEGER
) RETURNS INTEGER AS $$""")

# ------------------------------------------------------------------ F-35 Step A
P("F35-step-a-insert",
  """    -- Step A: Create the Employee Master
    INSERT INTO employees (name, job_number, unit_id, position, contact_email, created_at)
    VALUES (p_name, p_job_number, p_unit_id, p_position, p_contact_email, now())
    RETURNING id INTO v_employee_id;""",
  """    -- Step A: Create the Employee Master.
    -- full_name and name are deliberately absent: trg_employees_compose_full_name
    -- derives both from the three name parts on this same INSERT (2.8.7c).
    INSERT INTO employees (
      first_name, middle_name, last_name,
      job_number, job_title, file_no, rank_grade, nationality,
      job_post_location, actual_work_place, specialty, marital_status, salary,
      unit_id, position, contact_email, created_at
    )
    VALUES (
      p_first_name, p_middle_name, p_last_name,
      p_job_number, p_job_title, p_file_no, p_rank_grade, p_nationality,
      p_job_post_location, p_actual_work_place, p_specialty, p_marital_status, p_salary,
      p_unit_id, p_position, p_contact_email, now()
    )
    RETURNING id INTO v_employee_id;""")

# ------------------------------------------------------------------ F-36 Step B
P("F36-step-b-contract",
  """    INSERT INTO contracts (employee_id, start_date, end_date, status, created_at)
    VALUES (v_employee_id, p_contract_start, p_contract_end, 'Approved', now());""",
  """    INSERT INTO contracts (employee_id, start_date, end_date,
                           start_date_hijri, end_date_hijri, status, created_at)
    VALUES (v_employee_id, p_contract_start, p_contract_end,
            p_contract_start_hijri, p_contract_end_hijri, 'Approved', now());""")

# ------------------------------------------------------------------ F-34/F-36 audit payload
P("F35-audit-payload",
  "      jsonb_build_object('job_number', p_job_number)",
  """      jsonb_build_object(
        'job_number', p_job_number,
        'first_name', p_first_name,
        'middle_name', p_middle_name,
        'last_name', p_last_name,
        'contract_start', p_contract_start,
        'contract_end', p_contract_end,
        'contract_start_hijri', p_contract_start_hijri,
        'contract_end_hijri', p_contract_end_hijri
      )""")

# ------------------------------------------------------------------ F-35 application service
P("F35-service-call",
  """    SELECT fn_onboard_employee_with_contract(
      ${dto.name},
      ${dto.jobNumber},
      ${dto.unitId},
      ${dto.position},
      ${dto.contactEmail},
      ${dto.contractStart},
      ${dto.contractEnd},
      ${actorId}
    ) as employee_id;""",
  """    SELECT fn_onboard_employee_with_contract(
      ${dto.firstName},
      ${dto.middleName ?? null},
      ${dto.lastName},
      ${dto.jobNumber},
      ${dto.jobTitle},
      ${dto.fileNo},
      ${dto.rankGrade},
      ${dto.nationality},
      ${dto.jobPostLocation},
      ${dto.actualWorkPlace},
      ${dto.specialty},
      ${dto.maritalStatus},
      ${dto.salary},
      ${dto.unitId},
      ${dto.position},
      ${dto.contactEmail},
      ${dto.contractStart},
      ${dto.contractEnd},
      // Umm al-Qura equivalents of the two dates, converted at the edge (2.8.7c)
      ${dto.contractStartHijri},
      ${dto.contractEndHijri},
      ${actorId}
    ) as employee_id;""")

# ------------------------------------------------------------------ F-36 §4.2 rule
P("F36-contract-calendars-rule",
  "- Start and end dates are inclusive. The next nonoverlapping renewal starts after the previous end date.",
  """- Start and end dates are inclusive. The next nonoverlapping renewal starts after the previous end date.
- **Contract dates are recorded in both calendars (2.8.7c).** Contract Start and Contract End are required. HR enters a Gregorian date and the Umm al-Qura (Saudi official) equivalent is converted and stored alongside it as `start_date_hijri` / `end_date_hijri`. The Gregorian pair stays authoritative for all coverage arithmetic; the Hijri pair is the human-facing record, stored rather than recomputed so it cannot drift if a runtime's calendar tables are updated. Conversion uses `Intl` with the `islamic-umalqura` calendar extension, which is the only basis accepted for these fields.""")

# ------------------------------------------------------------------ F-37 §4.2 rule
P("F37-guards-in-service-rule",
  "- The system does not support concurrent secondary contracts. Deliberate replacement requires explicit HR handling; silent superseding has been removed.",
  """- The system does not support concurrent secondary contracts. Deliberate replacement requires explicit HR handling; silent superseding has been removed.
- **Guards belong to the service layer, not to a screen (2.8.7c).** Contract creation and update reject: a contract whose employee does not exist or is soft-deleted (`EMPLOYEE_NOT_FOUND`); a period whose end is on or before its start; and an `Approved` or `Active` period that overlaps another `Approved`/`Active` period for the same employee (`CONTRACT_PERIOD_OVERLAP`). These checks must not live only in a UI component — the API, background jobs and any future caller pass through the same path. `Draft` and `PendingApproval` provide no coverage and may therefore sit on an existing period until approved. The database exclusion constraint remains the final authority; the service check exists so the failure is explained before it reaches the database.""")

# ------------------------------------------------------------------ F-38 renewal entry
P("F38-renewal-entry",
  "**Implementation — overlap exclusion constraint:**",
  """**Renewal entry (2.8.7c).** The Create Contract form appends the Contract Start and Contract End recorded at onboarding: selecting an employee displays that period in both calendars and prefills the pickers with a renewal that starts the day after the previous end and runs for the same length, which satisfies the exclusion constraint by construction. The prefilled dates remain editable, and the guard in the rule above still applies to whatever HR finally submits.

**Implementation — overlap exclusion constraint:**""")


# ------------------------------------------------------------------ run
print(f"Patches defined: {len(patches)}")
failures = []
for name, old, new, count in patches:
    found = text.count(old)
    if found != count:
        failures.append((name, found, count))
        print(f"FAIL  {name}: found {found}, expected {count}")
    else:
        text = text.replace(old, new)
        print(f"ok    {name} ({count})")

if failures:
    print(f"\n{len(failures)} patch(es) failed — output NOT written.")
    raise SystemExit(1)

DOC.write_text(text, encoding='utf-8')
print(f"\nAll {len(patches)} patches applied. Updated {DOC}")
