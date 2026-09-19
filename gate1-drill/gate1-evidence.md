# Gate 1 Restore Drill — Evidence Record

**Run at:** 2026-09-18T11:03:45Z  
**PostgreSQL:** postgres (PostgreSQL) 15.19 (Debian 15.19-1.pgdg13+2)  
**Recovery target:** 2026-09-18 11:03:43.944+00  
**Result:** **PASS**

| Check | Value | Expected | Result |
| :--- | :--- | :--- | :--- |
| Employees restored | 120 | 120 | PASS |
| Contracts restored | 120 | source | — |
| Credentials restored | 480 | source | — |
| Audit entries restored | 245 | 245 | PASS |
| Nursing units | 47 | 47 | PASS |
| Total beds | 582 | 582 | PASS |
| Broken audit chain links | 0 | 0 | PASS |
| Rows after recovery target | 0 | 0 | PASS |
| Elapsed (restore) | 3s | — | — |
| Elapsed (total drill) | 3s (0m) | ≤ 240m | PASS |
| Latest audit row | 2026-09-18 11:03:42.37005+00 | ≤ target | PASS |

## Commands executed

```
TARGET_TIME=2026-09-18 11:03:43.944+00
bash scripts/restore-database.sh "${TARGET_TIME}"
```

## Sign-off

| Role | Name | Date |
| :--- | :--- | :--- |
| Operator (ran the drill) | | |
| Reviewer (verified evidence) | | |

## Provable point-in-time recovery (driver: `scripts/pitr-proof.sh`)

Marker rows were written on both sides of the recovery target, and both
batches were archived to WAL *before* the restore, so the absence of the
post-target rows is a genuine time-based cut — not a missing segment.

| Assertion | Observed | Expected | Result |
| :--- | :--- | :--- | :--- |
| Pre-target marker rows present | 5 | 5 | PASS |
| Post-target marker rows absent | 0 | 0 | PASS |
| Audit rows at target | 245 | 245 | PASS |
| Audit rows at present (source) | — | 248 | (excluded by design) |
| Audit chain breaks after restore | 0 | 0 | PASS |
| Total beds after restore | 582 | 582 | PASS |
| Restored max audit timestamp | 2026-09-18 11:03:42.37005+00 | ≤ 2026-09-18 11:03:43.944+00 | PASS |

Recovery target (T0, database clock): `2026-09-18 11:03:43.944+00`

**All PITR assertions passed.**
