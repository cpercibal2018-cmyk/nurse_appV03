// src/modules/config/residency.check.ts
// B-25 — fail-closed KSA data-residency startup check (Section 8.3.6).
//
// The reviewed baseline read DATA_RESIDENCY_REGION and compared it to
// PDPL_ALLOWED_REGIONS — but the example allowlist in the spec contained
// `me-south-1`, which is AWS BAHRAIN, not Saudi Arabia. A misconfigured
// allowlist therefore passed the check.
//
// This version fails closed:
//   * an empty or missing allowlist refuses to boot,
//   * a region on the deny-list refuses to boot,
//   * a region not on the allowlist refuses to boot,
//   * production mode cannot use the sandbox region.
//
// PRODUCTION_TARGET (2.8.7b): Node 20 LTS / PostgreSQL 15.

/** Regions that must NEVER be accepted — Middle East regions outside the Kingdom. */
export const KSA_DENY_REGIONS = [
  'me-south-1',   // AWS Bahrain
  'me-central-1', // AWS UAE
] as const;

/**
 * Regions accepted as within the Kingdom. Extend per provider when the
 * hosting decision is signed (Section 13.4.1).
 *   me-jeddah-1 / me-riyadh-1 — Oracle KSA
 *   me-central-2              — Google Cloud Dammam (KSA)
 *   ksa-onprem                — hospital data centre (Option A pilot)
 */
export const KSA_ALLOW_REGIONS = [
  'me-jeddah-1',
  'me-riyadh-1',
  'me-central-2',
  'ksa-onprem',
] as const;

/** Sandbox/dev marker — never acceptable in production. */
export const NON_PRODUCTION_REGIONS = ['sandbox', 'local', 'dev'] as const;

export class ResidencyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResidencyConfigurationError';
  }
}

export interface ResidencyConfig {
  region: string;
  allowed: string[];
  isProduction: boolean;
}

/**
 * Validates residency configuration. Throws ResidencyConfigurationError when
 * the deployment must not boot. Called during application bootstrap, before
 * the HTTP listener starts.
 */
export function assertResidency(cfg: ResidencyConfig): void {
  const region = (cfg.region ?? '').trim().toLowerCase();

  if (!region) {
    throw new ResidencyConfigurationError(
      'DATA_RESIDENCY_REGION is not set — refusing to start. ' +
        'All production data, backups and WAL archives must reside in KSA (PDPL, Section 8.3.6).',
    );
  }

  // Fail closed on an unset/empty allowlist rather than defaulting to open.
  const allow = (cfg.allowed ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (allow.length === 0) {
    throw new ResidencyConfigurationError(
      'PDPL_ALLOWED_REGIONS is empty — refusing to start (fail-closed policy).',
    );
  }

  // Approved allowlist must itself be KSA-clean: catch a misconfigured list.
  const polluted = allow.filter((r) =>
    (KSA_DENY_REGIONS as readonly string[]).includes(r),
  );
  if (polluted.length > 0) {
    throw new ResidencyConfigurationError(
      `PDPL_ALLOWED_REGIONS contains non-KSA region(s): ${polluted.join(', ')}. ` +
        'me-south-1 is Bahrain and me-central-1 is the UAE — remove them.',
    );
  }

  if (!allow.includes(region)) {
    throw new ResidencyConfigurationError(
      `DATA_RESIDENCY_REGION "${region}" is not in PDPL_ALLOWED_REGIONS. ` +
        'Refusing to start — data residency cannot be confirmed.',
    );
  }

  if (
    cfg.isProduction &&
    (NON_PRODUCTION_REGIONS as readonly string[]).includes(region)
  ) {
    throw new ResidencyConfigurationError(
      `Region "${region}" is a sandbox/dev marker and cannot be used in production.`,
    );
  }
}

/** Convenience wrapper reading process.env — call from main.ts and main-worker.ts. */
export function assertResidencyFromEnv(): void {
  assertResidency({
    region: process.env.DATA_RESIDENCY_REGION ?? '',
    allowed: (process.env.PDPL_ALLOWED_REGIONS ?? '').split(',').map((s) => s.trim()),
    isProduction: process.env.NODE_ENV === 'production',
  });
}
