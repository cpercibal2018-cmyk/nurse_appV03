# Gate 1 Failure-Injection — Evidence Record

**Run at:** 2026-09-18T11:08:52Z  
**Run tag:** `run-20260918110348`  
**PostgreSQL:** postgres (PostgreSQL) 15.19 (Debian 15.19-1.pgdg13+2)  
**Host settings:** fsync=on, full_page_writes=on, synchronous_commit=on, archive_timeout=300  
**Result:** **PASS**

The restore drill answers *can we go back in time?* This drill answers the
two questions a restore drill cannot: *does confirmed work survive the
machine dying?* and *how much work can the archive actually lose?*

## Phase 1 — Durability and atomicity under SIGKILL

The postmaster was killed with SIGKILL: no checkpoint, no clean shutdown,
the shape of a real power loss. Automatic crash recovery then ran on restart.
Every probe row is scoped to run tag `run-20260918110348`; no audit rows were
deleted at any point, since removing rows from the middle of a hash chain
would itself break the chain this phase is checking.

| Check | Value | Expected | Result |
| :--- | :--- | :--- | :--- |
| Transactions confirmed COMMIT | 100 | — | — |
| Committed rows present after SIGKILL | 100 | 100 | PASS |
| Uncommitted rows rolled back | 0 | 0 | PASS |
| Audit entries for committed work | 100 | 100 | PASS |
| Audit chain breaks after crash | 0 | 0 | PASS |
| Crash recovery triggered | 1 message(s) | ≥ 1 | PASS |
| fsync | on | on | PASS |
| full_page_writes | on | on | PASS |

**Phase 1 result: PASS**

## Phase 2 — Measured RPO

No WAL switches were forced during this measurement. Forcing a switch would
close the segment immediately and measure the switch rather than the
`archive_timeout` bound, which is the thing the RPO claim rests on.
Recoverability was confirmed by performing a real restore to the marker's
commit time, not by asserting that a file exists on disk.

| Check | Value | Expected | Result |
| :--- | :--- | :--- | :--- |
| Marker committed at | 2026-09-18 11:03:50.208+00 | — | — |
| WAL segment | 000000010000000000000006 | — | — |
| Time commit → encrypted archive | 298s | ≤ 300s | PASS |
| Restore target used | 2026-09-18 11:03:51+00 | — | — |
| Marker recoverable by restore | 1 | 1 | PASS |
| Terminator after target absent | 0 | 0 | PASS |
| archive_timeout (the enforceable bound) | 300s | — | — |

**Phase 2 result: PASS**

## Sign-off

| Role | Name | Date |
| :--- | :--- | :--- |
| Operator (ran the drill) | | |
| Reviewer (verified evidence) | | |
