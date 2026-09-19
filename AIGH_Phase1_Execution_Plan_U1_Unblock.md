# Phase 1 Execution Plan — Taking the Hosting Decision Off the Critical Path

**Companion to:** `AIGH_Nursing_Workforce_Management_System_v2_8_7.md` (rev 2.8.7c) · `AIGH_v2_8_7_remediation_tracker.md` · `AIGH_U1_Hosting_Decision_Pack.md` (signature-ready memo for the CIO)
**Prepared:** 18 September 2026

---

## 1. The problem this plan solves

Section 13.4.1 of the specification is correct that the hosting decision (U1) has the widest blast radius — eight subsystems depend on it. But the roadmap then treats that dependency as **"no work may start."** Result: if the hospital takes three weeks to decide, three weeks of engineering work evaporates, because Wave 1B was written as a serial, gated block.

That is a sequencing bug, not a technical one. This plan fixes it with two moves:

1. **Split the gate in two.** Gate 1 = *engineering readiness* (provable on a KSA sandbox with synthetic data — needs **no** hospital hosting decision). Gate 2 = *production readiness* (needs U1). The eight "blocked" subsystems can all be built, configured and tested against Gate 1; only their production deployment waits.
2. **Make indecision non-blocking.** A decision sprint with a published deadline, a scored option shortlist, and a **default-if-silent rule**: if U1 is not decided by Day 10, the on-premise pilot becomes the interim default and Wave 1B proceeds. Reversing that default later costs a re-hosting exercise, not a rewrite.

---

## 2. The reframe: U1 blocks go-live, not work

| Subsystem (from §13.4.1) | What waits for U1 | What starts **now** on the sandbox |
| :--- | :--- | :--- |
| PDPL field encryption (V35) | Key custody in the production HSM/KMS | Schema, `FieldCryptoService`, register, rights tables, tests |
| Database privilege separation (10.7) | The production PostgreSQL instance | Role/grant scripts, negative tests, contract-lifecycle test |
| Backups + WAL archiving (10.6) | The encrypted production destination | Full backup/restore cycle + timed restore drill on the sandbox |
| Upload quarantine + ClamAV (5.3.2) | The production ClamAV host | Pipeline, EICAR test, spoof rejection, retry exhaustion |
| Admin guardrails / PAM (3.5, V42) | Session infrastructure choice | Tables, four-eyes flow, expiry worker, tests |
| Secure evidence vault (5.3, V41) | Storage backend (object store vs filesystem) | Adapter, signed-URL TTL, checksum tamper test |
| PII blind indexing (V37) | HMAC key custody | Index columns, key-version rotation path, latency test |
| Crypto-shredding (V38) | Key hierarchy | Key store, chain-integrity test after shredding |

The sandbox holds **synthetic workforce data only** — no real nurse records — so PDPL residency and PHI risk do not apply to it. It can run on any hospital workstation-class host, in the existing data centre, or on a KSA provider's smallest instance.

---

## 3. Gate 1 — the KSA sandbox

**Purpose:** a disposable, reproducible environment where every Wave 1A/1B engineering item is built and proven before a production host exists.

**Specification**

| Item | Sandbox requirement |
| :--- | :--- |
| Host | 1 × Linux host, 4 vCPU / 16 GB RAM / 200 GB disk (existing hardware is fine) |
| Runtime | Node 20 LTS container, PostgreSQL 15 container, Redis 7 |
| PostgreSQL | `wal_level=replica`, `archive_mode=on`, `archive_timeout=300`, local WAL archive directory |
| Malware scanning | ClamAV container (signature freshness test included) |
| Email | MailHog instead of the hospital relay (delivery assertions read from MailHog's API) |
| Storage | Local directory for evidence; MinIO container if the object-store path is being rehearsed |
| Data | **Synthetic only** — generated workforce, contracts, credentials; never production extracts |
| Labelling | Environment banner "SANDBOX — NOT PRODUCTION"; no real staff contact details |

**Provisioning (append to the production compose, no other changes):**

```yaml
# docker-compose.sandbox.yml
services:
  db:
    command:
      - postgres
      - -c
      - wal_level=replica
      - -c
      - archive_mode=on
      - -c
      - archive_timeout=300
      - -c
      - archive_command=test ! -f /wal-archive/%f && cp %p /wal-archive/%f
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./wal-archive:/wal-archive

  clamav:
    image: clamav/clamav:stable

  mailhog:
    image: mailhog/mailhog
    ports: ["8025:8025"]   # UI/API for delivery assertions
```

```bash
docker compose -f docker-compose.production.yml -f docker-compose.sandbox.yml up -d
MIGRATION_DATABASE_URL=... npx prisma migrate deploy
npm run seed -- --synthetic     # synthetic workforce only
```

**Gate 1 exit criteria (no U1 required):**

- 116-test suite green on Node 20 / PostgreSQL 15.
- Wave 1A items closed (tracker: B-02, B-04, B-08, B-09, B-10, B-11, B-13, B-19, B-23, B-24, B-25).
- Sandbox end-to-end run: onboarding → claim → upload (quarantine + EICAR) → approval → grace-period publication → notification outbox.
- Timed restore drill on the sandbox within the 4-hour RTO, with the post-restore checklist passing.
- Crashed-worker test: kill the worker mid-scan; the V49 lease expires and the next run resumes.

---

## 4. The decision sprint — 5 business days, then the default applies

| Day | Activity | Output |
| :--- | :--- | :--- |
| 1 | Walk through the §13.4.1 requirements brief; inventory existing hospital assets (servers, storage, backup destination, SMTP relay, internet egress, certificates, SCFHS reachability) | Asset inventory + confirmed requirements |
| 2 | Option walkthroughs: **A** on-premise, **B** KSA sovereign cloud, **C** hybrid (see Appendix A); collect quotes and lead times | Costed options with lead times |
| 3 | Scored workshop against the criteria matrix (Appendix B); open risks: KMS/HSM, backup destination, ClamAV host, DR location | Scored matrix |
| 4 | Draft decision memo + reversal plan; DPO/Security review of residency evidence for the chosen option | Draft memo |
| 5 | Decision meeting (CIO chair; DON, Medical Director, IT Security, DPO present); sign the memo; publish hosting brief v2 | **Signed hosting decision memo** |

**Attendees (minimum):** CIO/IT Director (chair), Director of Nursing, Medical Director, IT Security, DPO/Compliance, Operations owner, vendor tech lead.

**Deadline:** decision memo signed by end of business **Day 10** (two working weeks).

**Default-if-silent rule:** if no signed memo exists at Day 10, **Option A (on-premise pilot)** becomes the interim default:

- It requires zero procurement, satisfies KSA residency by construction, and uses the hospital network that already reaches SCFHS.
- It is reversible: the application is containerized and the data path is a standard `pg_dump`/`pg_basebackup` + WAL replay exercise already rehearsed on the sandbox; reversal is a re-hosting task, not a rewrite.
- Production sign-off (Gate 2) still requires the signed memo — the default unblocks **work**, it does not bypass governance.

---

## 5. Revised timeline and gates

| Scenario | U1 decided | Wave 1B work starts | Staging ready | Pilot starts | Production gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Best case | Week 1 | Week 2 (sandbox) | Week 5 | Week 6 | Week 10 |
| **Default-if-silent** | — (default applies) | Week 2 (sandbox) | Week 6 | Week 7 | Week 11 |
| Late decision | Week 6 | Week 2 (sandbox) | Week 10 | Week 11 | Week 15 |

The only column that moves materially is **production host readiness** — engineering, testing, staging and the pilot scenario are insulated by the sandbox. That is the whole point of the plan: the hospital's decision pace no longer sets the engineering pace.

**Gate definitions:**

- **Gate 1 — engineering readiness** (no U1): the exit criteria in §3. Decided by the vendor tech lead + hospital IT liaison.
- **Gate 2 — production readiness** (requires U1): privilege separation on the production database, encrypted backups + WAL to the KSA destination, production ClamAV, TLS termination, hospital SMTP relay, signed residency attestation, restore drill on production hardware. Decided by the CIO with the DPO.

---

## 6. This week's work (mapped to the tracker)

| Tracker ID | Action | Owner |
| :--- | :--- | :--- |
| B-24 | Implement bulk capacity API + CSV import + configuration grid (§2.9 of the spec) | Backend + Frontend |
| B-25 | Apply the KSA region allowlist correction (fail-closed test) | Backend |
| B-26 | Stand up the KSA sandbox per §3 and start the decision sprint per §4 | DevOps + PMO |
| B-02, B-04, B-08, B-09, B-10, B-11, B-13, B-19, B-23 | Decision-independent Wave 1A items — start immediately | per tracker |
| B-01 | Closed: capacity is runtime configuration; HR enters the required plan in-system | HR Admin + Tech Lead |

**Capacity note:** hosting sizing uses the **configured** bed plan, not the 47-unit / 582-bed seed. HR enters the required numbers through the bulk configuration screen (§2.9) and the total is read from `GET /api/v1/units/summary`, so the sizing brief can be finalised the day the plan is entered — no data migration, no release.

---

## 7. Escalation and decision log

| Item | Owner | Mechanism | Escalation |
| :--- | :--- | :--- | :--- |
| U1 hosting | CIO / IT Director | Standing item in the weekly project meeting; sprint Days 1–5 | Hospital executive committee if Day 10 passes |
| U2 credential policy | Director of Nursing | 90-minute workshop (§13.4.2) | Chief Medical Officer |
| U3 SCFHS agreement | Medical Director | Request letter; weekly status | Hospital General Director |

**Decision log template (one row per decision):**

| Date | Decision | Options considered | Rationale | Owner | Reversal cost | Review date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | | |

---

## Appendix A — KSA-compliant hosting options

| Option | Description | Strengths | Constraints |
| :--- | :--- | :--- | :--- |
| **A — On-premise pilot (default)** | Application, database and backups in the hospital data centre | Residency trivially satisfied; existing SCFHS network path; no procurement; full control | Hospital IT owns patching/backups; DR needs a second location; HSM/KMS may be file-based vault initially |
| **B — KSA sovereign cloud** | Containers + managed PostgreSQL in a KSA region (e.g. Oracle Jeddah/Riyadh, Google Dammam `me-central-2`, or a local provider) | Managed PITR/WAL, KMS/HSM, in-KSA DR region, offloads operations | Procurement lead time (4–12 weeks); cost; egress/approval questions for SCFHS calls |
| **C — Hybrid** | Application in KSA cloud, database on-premise (or the inverse) | Fits a specific constraint (e.g. data must stay on-prem but compute is scarce) | Generally **not recommended**: splits residency evidence and complicates backup/network design |

> **Residency warning:** AWS `me-south-1` (Bahrain) and `me-central-1` (UAE) are **not** in the Kingdom. They must never appear in `PDPL_ALLOWED_REGIONS` (the 2.8.7a amendment corrects an earlier example that included `me-south-1`).

---

## Appendix B — Decision criteria matrix

| Criterion | Weight | A on-prem | B KSA cloud | Notes |
| :--- | :--- | :--- | :--- | :--- |
| PDPL residency evidence | Must | | | Contract + infrastructure attestation |
| KMS/HSM availability for V35 keys | Must | | | File-based vault acceptable for pilot only |
| Managed PostgreSQL 15 + WAL/PITR | Must | | | Sandbox proves the scripts either way |
| Backup destination inside KSA + restore rehearsal | Must | | | Off-site or second-region |
| ClamAV host + daily signature updates | Must | | | Requires outbound updates |
| SMTP relay (STARTTLS:587) + SCFHS reachability | Must | | | Test from the target network |
| TLS certificate management | Should | | | Internal CA vs public CA |
| DR capability vs RTO 4h / RPO ≤5 min | Should | | | State the achievable figures |
| Cost (3-year) | Should | | | Include ops effort |
| Ops ownership clarity | Should | | | Named owner per component |
| Time to first production-ready host | Must | | | The metric that sets the pilot date |

Score each cell 0–3, total by weight, and attach the result to the signed memo.

---

## Bottom line

Hosting remains the hospital's most consequential decision — this plan does not downgrade it. It changes **what the decision blocks**: from "all Phase-1 engineering" to "the production cutover only." Combined with the 2.8.7a amendment making unit and bed capacity a runtime configuration, the project can now start everything worth starting this week, size the platform from the configured plan rather than a seed number, and still hold production behind a signed, properly governed decision.
