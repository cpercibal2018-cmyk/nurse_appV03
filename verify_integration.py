import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))
doc = (ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md').read_text(encoding='utf-8')

# (finding, must_be_present[], must_be_absent[])
checks = [
 ("F-01 unit/bed totals", ["47 nursing units","582","seeded baseline"], ["49 nursing units","747"]),
 ("F-02 Node 20 image",   ["node:20-alpine","npx prisma generate","AS prod-deps"], ["node:24-alpine"]),
 ("F-03 refresh cookie",  ["nurseapp_refresh","SameSite=Lax","browsers reject"], ["__Host-refresh"]),
 ("F-04 CSRF ordering",   ["order matters: authenticate, then check CSRF","do NOT register CsrfGuard as APP_GUARD"], []),
 ("F-05 privilege scope", ["fn_contract_status_guard","REVOKE INSERT ON employees FROM nurseapp_runtime"], ["REVOKE INSERT ON contracts FROM nurseapp_runtime"]),
 ("F-06 audit schema",    ["CREATE TABLE audit_entries","fn_append_audit_entry","ORDER BY id DESC"], ["FROM audit_events","audit_events ae"]),
 ("F-07 V32/V35 bodies",  ["V32_upload_quarantine_scan.sql","V35_pdpl_controls.sql","iqama_ciphertext"], []),
 ("F-08 runbook counts",  ["68 expected","20 expected","Node 24 / PostgreSQL 17.11"], ["61 expected","16 expected","PG 18.4"]),
 ("F-09 idempotency",     ["processing_lease_expires_at","identifiers only","can be retaken"], []),
 ("F-10 eligibility tx",  ["tx: PrismaTransactionClient = this.prisma","Publication does not trust the snapshot"], []),
 ("F-11 worker leases",   ["worker_leases","withLease","SUPERSEDED (2.8.7)"], []),
 ("F-12 onboarding fn",   ["fn_append_audit_entry","SET search_path = pg_catalog, public;\n\n-- Deliberately NO","POSITION_NOT_ACTIVE"], []),
 ("F-13 four-eyes",       ["FOR UPDATE","uq_admin_request_pending","Only a PENDING request may be approved"], ["uq_admin_request UNIQUE"]),
 ("F-14 auditor null",    ["CONSISTENCY_AUDIT_MISSING_STATE","A missing state row is itself a drift condition"], []),
 ("F-15 FHIR validity",   ["resourceType: 'PractitionerRole'","fhir.controller.ts"], ["practitionerRole: [{ reference"]),
 ("F-16 attendance tz",   ["AT TIME ZONE 'Asia/Riyadh'","now() - interval '15 minutes'"], ["sa.start_date"]),
 ("F-17 SSO cookie",      ["Lax, not Strict: Strict blocks the IdP redirect"], []),
 ("F-18 waiver limits",   ["chk_waiver_max_window","chk_waiver_future"], []),
 ("F-19 PDPL soft spots", ["blind_key_version","detects a **misconfigured deployment**","Scope of erasure (backups)"], []),
 ("F-20 bundle budget",   ["check-bundle-size.mjs","'@tanstack/react-query'","raw-kB warning"], []),
 ("F-21 compose",         ["condition: service_healthy","proxy:","expose: [\"3000\"]"], ['ports: ["3000:3000"]']),
 ("F-22 Dockerfile",      ["--omit=dev","HEALTHCHECK","NODE_ENV=production"], []),
 ("F-23 backup scripts",  ["--compress=gzip:6","wal-restore.sh","BACKUP_GPG_HOME","is not a public-key encrypted file","`restore_command` returns non-zero","Correction applied in 2.8.7b"], ["--gzip \\","--compress=6 \\","--passphrase-file \"${DECRYPTION_KEY}\"","BACKUP_DECRYPTION_KEY_PATH"]),
 ("F-24 RPO arithmetic",  ["≤ 5 minutes","RPO derivation"], ["< 1 minute (bounded by WAL shipping delay)"]),
 ("F-25 endpoint drift",  ["GET /api/v1/positions"], ["workforce/positions"]),
 ("F-26 NS naming",       ["Nursing Supervisor) | Mandatory credentials"], []),
 ("F-27 §0.3 range",      ["V27–V48 reassigned"], []),
 ("F-28 V45 section",     ["| V45 | Enterprise integration (FHIR/attendance/export) | 14.1–14.3 |"], []),
 ("F-29 migration objs",  ["migration_audit_log","map_unit(raw TEXT)","unit_map"], []),
 ("F-30 criterion",       ["credential custody and pipeline scope"], []),
 ("F-31 §12 counts",      ["Thirty-nine sections"], ["Thirty subsystems"]),
 ("F-32 contents",        ["2.8.7 note:"], []),
]
integrated, open_items = [], []
for name, present, absent in checks:
    miss = [s for s in present if s not in doc]
    stale = [s for s in absent if s in doc]
    if miss or stale:
        open_items.append((name, miss, stale))
    else:
        integrated.append(name)

print(f"INTEGRATED : {len(integrated)-0}/{len(checks)}")
for n in integrated: print("  ok   ", n)
print()
print(f"NOT YET INTEGRATED : {len(open_items)}")
for n, miss, stale in open_items:
    print("  open ", n)
    if miss:  print("        missing:", miss)
    if stale: print("        stale  :", stale)
