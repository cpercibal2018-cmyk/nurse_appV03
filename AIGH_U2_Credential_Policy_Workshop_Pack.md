# U2 — Credential Policy & Position Rules Workshop Pack
### AIGH Nursing Workforce Management System

**Purpose:** produce a signed credential policy memo that lets the eligibility engine schedule nurses in the five positions that currently have **no rules defined**.
**Owner:** Director of Nursing · **Escalation:** Chief Medical Officer
**Deadline:** Week 3 — before Phase 2 staging begins
**Status:** prepared 18 September 2026 · specification rev 2.8.7c

---

## 1. Why this blocks the pilot

The eligibility engine is implemented and working — but it enforces rules that do not yet exist. Where no mandatory rule is configured for a unit/position, the engine **blocks scheduling rather than allowing it** (a deliberate safety choice: the system does not invent requirements, and it does not silently bypass them).

So today, nurses in these five positions cannot be scheduled:

`PRACTITIONER` · `NS` · `DON` · `DEPUTY_DON` · `ADMIN`

The Phase 2 pilot cannot complete its end-to-end scenario (upload → approval → eligibility → publication) without rules existing for the pilot positions.

> **Naming caution — read before the workshop.** In the position directory, **`NS` = Nursing Supervisor** (a management role). "Nurse Specialist" is an **SCFHS professional classification**, not a position code. Writing rules for the wrong interpretation will misconfigure the system.

---

## 2. Workshop — 90 minutes

| Time | Item | Lead |
| :--- | :--- | :--- |
| 0–10 | Confirm the position directory: 16 codes, 14 active, tiers and schedulability; confirm the five positions lacking rules | System administrator |
| 10–40 | **Rule definition** for the five positions (Section 3) — templates chosen from the credential catalog | Director of Nursing |
| 40–60 | **Grace periods** per credential template (Section 4) — confirm or override the recommended defaults | DON + compliance officer |
| 60–75 | **Policy transitions** — which new requirements start in `TRANSITION` mode with a deadline, and what the deadline is | DON + HR Admin |
| 75–85 | **NURSE_EDUCATOR** — does the role (formerly `CI`) require a teaching certification? | DON |
| 85–90 | Confirm next steps, owners, and the date the rules are entered via the CRUD API | HR Admin |

**Attendees:** Director of Nursing (chair) · HR Admin · Clinical compliance officer (SCFHS/CBAHI) · System administrator · Medical Director's representative (optional)

**Output:** a **signed credential policy memo** — the audit-trail record for why each rule exists. HR Admin then enters the rules through `POST /api/v1/credential-requirements` (single or `bulk`).

---

## 3. Rules to define — decision table

Credential codes are from the catalog in §5.1.2 of the specification (16 templates in 5 categories).

### 3.1 `PRACTITIONER` — Nurse Practitioner *(schedulable, Advanced Practice tier)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Mandatory, all units | e.g. SCFHS + BLS + PROF_LICENSE | |
| Unit-scoped additions | e.g. ACLS in critical care units | |
| Advanced-practice evidence | Is a certification beyond SCFHS registration required? | |
| Additional notes | | |

### 3.2 `NS` — Nursing Supervisor *(schedulable, Management tier)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Mandatory, all units | e.g. SCFHS + ACLS + specialty certification | |
| Multi-unit scope implications | Does the role need unit-specific competencies for every unit supervised, or only the home unit? | |

### 3.3 `DON` — Director of Nursing *(NOT schedulable, Executive tier)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Mandatory credentials | e.g. SCFHS + management qualification | |
| Note | Non-schedulable, but credentials are still tracked for compliance and reporting | |

### 3.4 `DEPUTY_DON` — Deputy Director of Nursing *(NOT schedulable)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Mandatory credentials | Align with DON, or a reduced set? | |

### 3.5 `ADMIN` — Administrator *(NOT schedulable)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Clinical credentials required? | Recommended: **none** — hospital ID only | |
| Note | The position is non-clinical and non-schedulable | |

### 3.6 `NURSE_EDUCATOR` — Clinical Nurse Educator *(schedulable, Specialist tier)*

| Decision | Options | Choice |
| :--- | :--- | :--- |
| Teaching certification required? | The role was created by migrating the deprecated `CI` code — teaching credentials were never defined | |
| Clinical currency | Does the educator need life-support currency for the units they train in? | |

### 3.7 Pre-existing unit/position rules — review

| Decision | Choice |
| :--- | :--- |
| Do existing unit-wide rules remain correct for `SN`, `CN`, `HN`, `MW`, `PCT`, `TEC`, `HCA`? | |
| Any unit-wide rule that should become position-specific? | |

---

## 4. Grace periods per credential template

Grace allows a nurse to remain eligible for a bounded period after expiry **provided a renewal is in progress**. Recommended defaults are below — confirm or override each. Range: 0–90 days.

| Template | Category | Recommended default | Hospital decision |
| :--- | :--- | :---: | :--- |
| SCFHS — Saudi Council License | Licensure | 30 days | |
| PROF_LICENSE — Professional License | Licensure | 30 days | |
| BLS | Life Support | 14 days | |
| ACLS | Life Support | 14 days | |
| PALS | Life Support | 14 days | |
| NRP | Life Support | 14 days | |
| BICSL | Life Support | 14 days | |
| PASSPORT | Identity & Legal | 30 days | |
| IQAMA — Resident ID | Identity & Legal | 30 days | |
| HOSPITAL_ID | Identity & Legal | **0 days** | |
| CORE_COMP — Core Competency | Competency | 7 days | |
| UNIT_COMP — Unit Competency | Competency | 7 days | |
| SEDATION — Conscious Sedation | Competency | 0 days | |
| MALPRACTICE — Medical Malpractice | Liability & Clearance | **0 days** | |
| EMP_CONTRACT — Employment Contract *(attachment only)* | Liability | n/a | |
| CLEARANCE — Staff Clearance *(no expiry)* | Liability | n/a | |

**Rules to confirm alongside the numbers**

- Grace applies **only** when a renewal is in progress (lifecycle label `OnProcess`) and the credential has not been suspended or revoked.
- Grace **never stacks** — one window per expiry cycle. A second consecutive expiry without a completed renewal is ineligible.
- Every assignment made under grace is audited and notified to HR — grace is never silent.
- If the renewal is rejected or the window closes, future published assignments are demoted to draft.

---

## 5. Policy transitions

For any requirement being newly introduced:

| Question | Choice |
| :--- | :--- |
| Enforce immediately, or use `TRANSITION` mode with a deadline? | |
| If `TRANSITION`: what is the deadline date? | |
| Who owns notifying affected staff? | |
| What happens on the deadline — automatic ineligibility? (Recommended: yes) | |

---

## 6. Credential policy memo — template

> **AIGH — Nursing Credential Policy Decision**
>
> **Date:** ____________  **Reference:** AIGH-U2-____
>
> **Scope:** mandatory credential requirements and grace periods for `PRACTITIONER`, `NS`, `DON`, `DEPUTY_DON`, `ADMIN`, `NURSE_EDUCATOR`, and the review of existing unit/position rules.
>
> **Decisions taken:** *(summary — full rule list attached as Annex A, grace periods as Annex B)*
>
> 1. ______________________________________________________________
> 2. ______________________________________________________________
> 3. ______________________________________________________________
>
> **Regulatory basis:** ☐ SCFHS requirement  ☐ CBAHI standard  ☐ Hospital policy  ☐ Other: __________
>
> **Effective date of the rules:** ____________
> **Transition mode used:** ☐ No  ☐ Yes — deadline ____________
>
> **Rule entry completed by:** HR Admin ____________ Date: ____________
> **Verification:** rules visible via `GET /api/v1/credential-requirements`; pilot-position eligibility returns a defined result (not "no rules configured").
>
> **Approved by:** Director of Nursing ____________________ Date: ____________
> **Reviewed by:** Clinical compliance officer ____________________
> **Acknowledged by:** HR Admin ____________________ · Medical Director ____________________

---

## 7. After the workshop

| Step | Action | Owner |
| :--- | :--- | :--- |
| 1 | Enter rules via `POST /api/v1/credential-requirements` (use `bulk` for initial configuration) | HR Admin |
| 2 | Set `grace_period_days` per template | HR Admin |
| 3 | Verify: pilot-position eligibility no longer returns "no rules configured" | Tech Lead |
| 4 | Run the Phase 2 pilot scenario end-to-end (upload → approval → eligibility → publication) | All |
| 5 | File the signed memo in the project decision log | PMO |

---

*Prepared from §13.4.2, §3.1.1, §5.1 and §6.1.1 of `AIGH_Nursing_Workforce_Management_System_v2_8_7.md`.*
