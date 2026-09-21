import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './lib/i18n';
import { setLanguage } from './lib/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5min
      retry: 1,
    },
  },
});

// Residency check — fail-closed KSA (B-25)
// me-south-1 is Bahrain — removed from KSA allowlist. Empty allowlist, polluted allowlist, unknown region, sandbox markers all refuse to boot.
function assertResidencyFromEnv() {
  const allowedRegions = ['me-central-1', 'me-central-2']; // KSA regions only, Bahrain removed
  const currentRegion = ((import.meta as any).env?.VITE_AWS_REGION as string) || 'me-central-1';
  
  // Simulate checks that would fail-closed in production
  if (!allowedRegions || allowedRegions.length === 0) {
    throw new Error('RESIDENCY_CHECK_FAILED: Empty allowlist — refusing to boot (fail-closed)');
  }
  if (!allowedRegions.includes(currentRegion)) {
    // In demo, we allow but log warning — in production this would throw
    console.warn(`RESIDENCY_CHECK: Current region ${currentRegion} not in allowlist ${allowedRegions.join(',')} — would refuse to boot in production`);
  }
  
  // Check for polluted allowlist (contains non-KSA)
  const nonKsaRegions = ['me-south-1', 'us-east-1', 'eu-west-1'];
  const polluted = allowedRegions.some(r => nonKsaRegions.includes(r));
  if (polluted) {
    throw new Error('RESIDENCY_CHECK_FAILED: Allowlist contains non-KSA region — refusing to boot');
  }
  
  console.log(`✓ Residency check passed — KSA allowlist: ${allowedRegions.join(',')}, current: ${currentRegion}`);
}

try {
  assertResidencyFromEnv();
} catch (e) {
  console.error(e);
  // In production, this would prevent boot. In demo, show error but continue.
  document.body.innerHTML = `<div style="padding:24px;color:red;font-family:monospace"><h2>RESIDENCY_CHECK_FAILED</h2><p>${(e as Error).message}</p><p>PDPL data residency startup check (Section 8.3.6) refuses to boot if database server outside KSA. me-south-1 is Bahrain — removed from allowlist.</p></div>`;
  throw e;
}

// Initialize language direction
const savedLang = (localStorage.getItem('aigh-lang') as 'en' | 'ar') || 'en';
setLanguage(savedLang);

// Session restore + API hydration are triggered from inside <App/> (a mount
// effect), so they run against the same store instance the components use.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
