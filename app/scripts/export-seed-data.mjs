#!/usr/bin/env node
/**
 * app/scripts/export-seed-data.mjs
 *
 * Generates server/prisma/seed-data.json from app/src/data/seed.ts, so the two
 * seeds cannot drift apart again.
 *
 * WHY A GENERATED SNAPSHOT RATHER THAN A DIRECT IMPORT
 * ----------------------------------------------------
 * `server/prisma/seed.ts` is the natural place to just `import` the app's data,
 * and it would work under `tsx` locally. It would NOT work in production:
 * docker-compose.yml builds the api service with `build: ./server`, so the
 * Docker build context contains `server/` and nothing else, and
 * server/Dockerfile's CMD runs `npx tsx prisma/seed.ts` inside the container at
 * boot. A `../../app/src/data/seed` import would resolve to a file that does not
 * exist in the image, and the API would fail to start.
 *
 * So the shared data is snapshotted INTO server/prisma/ — which the Dockerfile
 * already copies explicitly (`COPY prisma ./prisma`) — and staleness is policed
 * by section [20] of the test suite, which re-runs this extraction and fails if
 * the committed JSON no longer matches app/src/data/seed.ts.
 *
 * Source of truth: app/src/data/seed.ts. Never edit seed-data.json by hand;
 * edit the app seed and re-run `node scripts/export-seed-data.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_SEED = path.resolve(HERE, '../src/data/seed.ts');
const OUT_FILE = path.resolve(HERE, '../../server/prisma/seed-data.json');

/**
 * Extract every top-level array literal from a seed module.
 *
 * Bracket matching rather than a regex: the `fields` arrays inside
 * CREDENTIAL_TEMPLATES nest three deep, and a regex stop-at-first-`]` truncates
 * them. That truncation is precisely how the server seed came to hold
 * `fields: []` for five templates while the app seed held two to four entries.
 */
export function extractSeedCollections(filePath = APP_SEED) {
  const src = fs.readFileSync(filePath, 'utf8');
  const out = {};
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:_SEED)?)\s*(?::[^=]+)?=\s*\[/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf('[', m.index + m[0].length - 1);
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === '[') depth++;
      else if (src[j] === ']') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(open, j + 1);
    // `today` is in scope for the server seed's SHIFT_ASSIGNMENTS; harmless here.
    const today = new Date().toISOString().split('T')[0];
    out[m[1]] = new Function('today', `"use strict";return (${body});`)(today);
  }
  return out;
}

/**
 * The collections both seeds share, as JSON key -> app export name.
 * BED_CAPACITY_LOG_SEED is deliberately absent: the server's Prisma schema has
 * no BedCapacityLog model, so there is nothing to seed it into. That is a schema
 * gap, recorded separately — not something this script can paper over.
 */
export const SHARED_COLLECTIONS = {
  DEPARTMENTS: 'DEPARTMENTS',
  NURSING_UNITS: 'NURSING_UNITS',
  POSITIONS: 'POSITIONS',
  CREDENTIAL_CATEGORIES: 'CREDENTIAL_CATEGORIES',
  CREDENTIAL_TEMPLATES: 'CREDENTIAL_TEMPLATES',
  EMPLOYEES: 'EMPLOYEES_SEED',
  CONTRACTS: 'CONTRACTS_SEED',
  CREDENTIAL_REQUIREMENTS: 'CREDENTIAL_REQUIREMENTS_SEED',
};

/** Build the snapshot object. Deterministic: no timestamps, stable key order. */
export function buildSeedData(filePath = APP_SEED) {
  const extracted = extractSeedCollections(filePath);
  const data = {
    _generatedBy: 'app/scripts/export-seed-data.mjs',
    _source: 'app/src/data/seed.ts',
    _note: 'Do not edit by hand. Regenerate, or the test suite (section 20) will fail.',
  };
  const missing = [];
  for (const [jsonKey, appName] of Object.entries(SHARED_COLLECTIONS)) {
    if (!Array.isArray(extracted[appName])) { missing.push(appName); continue; }
    data[jsonKey] = extracted[appName];
  }
  if (missing.length) {
    throw new Error(`app seed no longer exports: ${missing.join(', ')}`);
  }
  return data;
}

/** Serialise exactly as the committed file should look. */
export function serialiseSeedData(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const data = buildSeedData();
  fs.writeFileSync(OUT_FILE, serialiseSeedData(data));
  const rows = Object.keys(SHARED_COLLECTIONS).map(k => `${k}=${data[k].length}`).join(' ');
  console.log(`wrote ${path.relative(path.resolve(HERE, '../..'), OUT_FILE)}`);
  console.log(`  ${rows}`);
  const fields = data.CREDENTIAL_TEMPLATES.reduce((n, t) => n + (t.fields || []).length, 0);
  console.log(`  credential-template field defs preserved: ${fields}`);
}
