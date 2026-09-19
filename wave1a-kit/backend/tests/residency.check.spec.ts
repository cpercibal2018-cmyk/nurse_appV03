// backend/tests/residency.check.spec.ts
// B-25 — the residency check must fail closed. Every case below that should
// throw would have PASSED under the reviewed baseline's example allowlist
// (it contained me-south-1, which is Bahrain).

import {
  assertResidency,
  ResidencyConfigurationError,
  KSA_ALLOW_REGIONS,
  KSA_DENY_REGIONS,
} from '../src/modules/config/residency.check';

describe('assertResidency', () => {
  const production = { isProduction: true, allowed: ['me-riyadh-1', 'ksa-onprem'] };

  it('accepts a KSA region on the allowlist', () => {
    expect(() =>
      assertResidency({ region: 'me-riyadh-1', ...production }),
    ).not.toThrow();
  });

  it('rejects a missing region', () => {
    expect(() => assertResidency({ region: '', ...production })).toThrow(
      ResidencyConfigurationError,
    );
  });

  it('rejects an empty allowlist (fail closed, not open)', () => {
    expect(() =>
      assertResidency({ region: 'me-riyadh-1', allowed: [], isProduction: true }),
    ).toThrow(/fail-closed|empty/i);
  });

  it('rejects a region absent from the allowlist', () => {
    expect(() =>
      assertResidency({ region: 'eu-west-1', ...production }),
    ).toThrow(/not in PDPL_ALLOWED_REGIONS/);
  });

  it.each(['me-south-1', 'me-central-1'])(
    'rejects a polluted allowlist containing %s',
    (bad) => {
      expect(() =>
        assertResidency({
          region: 'me-riyadh-1',
          allowed: ['me-riyadh-1', bad],
          isProduction: true,
        }),
      ).toThrow(/non-KSA/);
    },
  );

  it('never accepts a denied region directly', () => {
    for (const bad of KSA_DENY_REGIONS) {
      expect(() =>
        assertResidency({ region: bad, allowed: [...KSA_ALLOW_REGIONS, bad], isProduction: true }),
      ).toThrow(ResidencyConfigurationError);
    }
  });

  it('rejects a sandbox marker in production', () => {
    expect(() =>
      assertResidency({ region: 'sandbox', allowed: ['sandbox'], isProduction: true }),
    ).toThrow(/sandbox/);
  });

  it('allows a sandbox marker outside production (local dev only)', () => {
    expect(() =>
      assertResidency({ region: 'sandbox', allowed: ['sandbox'], isProduction: false }),
    ).not.toThrow();
  });
});
