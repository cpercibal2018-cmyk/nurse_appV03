export function checkEligibility(
  employeeId: number,
  date: Date,
  contracts: any[],
  credentials: any[],
  requirements: any[],
  gracePeriods: any[],
  waivers: any[]
) {
  const reasons: string[] = [];
  let status: 'ELIGIBLE' | 'ELIGIBLE_WITH_GRACE' | 'INELIGIBLE' = 'ELIGIBLE';

  // Check contract coverage
  const activeContracts = contracts.filter(c => 
    c.employeeId === employeeId && 
    (c.status === 'Active' || c.status === 'Approved') &&
    new Date(c.startDate) <= date && 
    new Date(c.endDate) >= date
  );

  if (activeContracts.length === 0) {
    reasons.push('No active contract coverage for date');
    status = 'INELIGIBLE';
  }

  // Check credential requirements
  for (const req of requirements) {
    const hasValid = credentials.some(c => 
      c.employeeId === employeeId && 
      c.templateId === req.templateId && 
      (c.validityStatus === 'Valid' || c.validityStatus === 'ExpiringSoon') &&
      new Date(c.expiryDate) >= date
    );

    if (!hasValid) {
      // Check waiver
      const hasWaiver = waivers.some(w => 
        w.employeeId === employeeId && 
        w.templateId === req.templateId && 
        new Date(w.expiryDate) > date
      );

      if (hasWaiver) {
        if (status !== 'INELIGIBLE') status = 'ELIGIBLE_WITH_GRACE';
        reasons.push(`Waived credential: ${req.templateId}`);
      } else {
        // Check grace
        const hasGrace = gracePeriods.some(g => 
          g.employeeId === employeeId && 
          g.templateId === req.templateId && 
          g.status === 'ACTIVE' &&
          new Date(g.expiresAt) > date
        );

        if (hasGrace) {
          if (status !== 'INELIGIBLE') status = 'ELIGIBLE_WITH_GRACE';
          reasons.push(`Grace period active for template ${req.templateId}`);
        } else {
          status = 'INELIGIBLE';
          reasons.push(`Missing mandatory credential: template ${req.templateId}`);
        }
      }
    }
  }

  return { eligibilityType: status, reasons };
}
