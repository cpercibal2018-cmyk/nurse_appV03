# U1 — Hosting Decision Pack
### AIGH Nursing Workforce Management System

**Purpose:** get a signed hosting decision by **Day 10**, or the on-premise default applies automatically.
**Owner:** Hospital CIO / IT Director · **Escalation:** Hospital Executive Committee
**Status:** prepared 18 September 2026 · specification rev 2.8.7b

---

## 1. What this decision is (and what it is not)

The decision is: **where does the production system run?**

It is **not** a decision about whether the project proceeds. Engineering has already been separated from hosting:

| | Blocked by this decision | Not blocked — running now |
| :--- | :--- | :--- |
| Application code | — | Wave 1A: worker leases, idempotency, bulk capacity entry, bundle budget, session hardening |
| Testing | — | 116-test suite on Node 20 / PostgreSQL 15 |
| Demonstration | — | Full end-to-end workflow on the KSA sandbox with synthetic data |
| **Production cutover** | ✅ 8 subsystems (below) | — |

**The eight subsystems that need a production host:** PDPL field encryption · database privilege separation · encrypted backups with WAL archiving · upload quarantine (ClamAV) · admin guardrails (PAM + four-eyes) · secure evidence vault · PII blind indexing · crypto-shredding.

---

## 2. Requirements brief (one page for IT governance)

| Resource | Requirement | Notes |
| :--- | :--- | :--- |
| Application runtime | Node 20 LTS · 2+ vCPU · 4+ GB RAM per process | Two processes: API and worker, deployed separately |
| Database | PostgreSQL 15 · 4+ vCPU · 8+ GB RAM | WAL archiving required for point-in-time recovery |
| Cache | Redis 7 · 1+ GB RAM | Optional for correctness — the system degrades to PostgreSQL |
| Malware scanning | ClamAV daemon · 2+ GB RAM | Daily signature updates require outbound internet |
| SMTP relay | Hospital relay, STARTTLS port 587 | Dedicated service account, e.g. `nurseapp@aigh.sa` |
| Storage | 50 GB initial (database + evidence documents) | Object-storage migration path exists if volume grows |
| Network | Private subnet for backend services · HTTPS-only public endpoint | Outbound access to the SCFHS API required in Phase 3 |
| Backups | Encrypted destination **inside KSA** · 30-day retention · WAL 7 days | Restore drill must complete inside 4 hours |
| Key management | KMS/HSM preferred; file-based vault acceptable for the pilot | Holds the PDPL field-encryption key and blind-index pepper |
| Service continuity | Recovery point ≤ 5 minutes · Recovery time ≤ 4 hours | Stated targets; to be confirmed by a drill |
| Capacity context | 582 beds / 47 units (seeded baseline — **editable in-system**) · 800–1500 nursing staff | Size to the configured plan, not the seed |

> **Residency is a hard requirement.** All production data, backups and WAL archives must reside in the Kingdom. AWS `me-south-1` (**Bahrain**) and `me-central-1` (**UAE**) are not in KSA and must never be used. The application refuses to boot if the configured region is outside the approved KSA list.

---

## 3. The three options

| | **A — On-premise** | **B — KSA sovereign cloud** | **C — Hybrid** |
| :--- | :--- | :--- | :--- |
| **Description** | App + database + backups in the hospital data centre | Containers + managed PostgreSQL in a KSA region | App in cloud, data on-premise (or the inverse) |
| **Residency** | Satisfied by construction | Satisfied by contract + region choice | Satisfied but evidence is split |
| **Cost** | Lowest (uses existing assets) | Subscription + egress | Usually highest (two of everything) |
| **Time to production host** | **Days** — no procurement | 4–12 weeks (procurement) | 4–12 weeks + integration |
| **Operations owner** | Hospital IT (patching, backups, DR) | Provider (managed), hospital retains governance | Split — the main risk |
| **DR capability** | Needs a second location | In-KSA second region available | Complex |
| **Managed PITR / KMS** | Manual (scripts provided in the spec) | Native | Mixed |
| **Verdict** | **Recommended for the pilot** | Recommended for scale | **Not recommended** |

**Recommendation:** start with **Option A** for the single-unit pilot (it needs no procurement and the scripts are already specified), and re-evaluate Option B at the Phase 4 scale decision. Moving to a cloud provider later is a re-hosting exercise — the system is containerized and the data path is a standard backup/restore — not a rewrite.

---

## 4. Scored decision matrix

Score each cell **0–3** (0 = poor, 3 = strong), multiply by weight, total.

| Criterion | Weight | A on-prem | B KSA cloud | C hybrid |
| :--- | :---: | :---: | :---: | :---: |
| PDPL residency — evidence available | 3 | | | |
| KMS/HSM for encryption keys | 3 | | | |
| Managed PostgreSQL 15 with PITR | 2 | | | |
| Backup destination inside KSA + restorability | 3 | | | |
| ClamAV host + signature updates | 2 | | | |
| SMTP relay + SCFHS reachability | 2 | | | |
| TLS certificate management | 1 | | | |
| Achievable RTO ≤ 4 h / RPO ≤ 5 min | 3 | | | |
| Three-year cost (incl. operations effort) | 2 | | | |
| Time to a production-ready host | 3 | | | |
| Clear operations ownership | 2 | | | |
| **Weighted total** | **26** | | | |

---

## 5. Decision memo template

> **AIGH Nursing Workforce Management System — Hosting Decision**
>
> **Date:** ____________  **Decision reference:** AIGH-U1-____
>
> **Decision:** Production hosting for the pilot will be **Option ____** (*on-premise / KSA sovereign cloud / hybrid*), effective ____________.
>
> **Rationale (brief):** ______________________________________________________________
>
> **Residency confirmation:** the selected location is inside the Kingdom of Saudi Arabia. Evidence attached: ____________________
>
> **Operations ownership accepted by:** ____________________ (name, role)
>
> **Recovery targets accepted:** RPO ______ minutes · RTO ______ hours
>
> **Key management accepted:** ☐ KMS/HSM  ☐ File-based vault (pilot only)
>
> **Reversal plan:** if the selected option is changed within 12 months, migration is performed by backup/restore plus WAL replay; estimated effort ______ days. Cost impact: ____________
>
> **Recommendation of the project team:** concur ☐ / do not concur ☐  Comments: ____________________
>
> **Approved by:** CIO / IT Director ____________________ Date: ____________
> **Acknowledged by:** DPO ____________________ · Director of Nursing ____________________ · Medical Director ____________________

---

## 6. Default-if-silent rule

If no signed memo exists by **Day 10** (two working weeks from the sprint start):

- **Option A (on-premise)** becomes the interim default and engineering proceeds against it.
- Production sign-off still requires the signed memo — the default unblocks **work**, it does not bypass governance.
- Reversal later is a re-hosting exercise, not a rewrite.

---

## 7. What happens the day the memo is signed

| Day | Action | Owner |
| :--- | :--- | :--- |
| 0 | Memo signed; hosting brief v2 issued | CIO |
| 1–2 | Host provisioned; PostgreSQL 15 and Redis installed | DevOps |
| 2–3 | Database roles created (`nurseapp_runtime`, `_migration`, `_backup`, `_audit_reader`); privilege grants applied | DBA |
| 3–4 | Backups configured: nightly base backup + WAL archiving to the encrypted KSA destination | DevOps |
| 4–5 | Application deployed behind TLS termination; SMTP relay connected | DevOps |
| 5–7 | ClamAV stood up; evidence vault and encryption keys configured | DevOps + Security |
| 7–10 | Full restore drill on production hardware; Gate 2 evidence pack assembled | DevOps + Tech Lead |

---

## 8. Sign-off checklist

- [ ] Requirements brief presented to IT governance
- [ ] Option walkthroughs completed (A / B / C)
- [ ] Scored matrix completed and attached
- [ ] DPO reviewed residency evidence for the chosen option
- [ ] Recovery targets confirmed
- [ ] Operations owner named and accepted
- [ ] Decision memo signed by CIO/IT Director
- [ ] Memo filed in the project decision log; brief v2 issued

---

*Prepared from §13.4.1 of `AIGH_Nursing_Workforce_Management_System_v2_8_7.md`. Detailed implementation follows `AIGH_Phase1_Execution_Plan_U1_Unblock.md`.*
