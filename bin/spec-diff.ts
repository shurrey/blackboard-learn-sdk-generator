#!/usr/bin/env tsx

/**
 * Compare a vendored spec against the latest upstream spec.
 *
 * Usage: tsx bin/spec-diff.ts [--verbose]
 *
 * Exit codes:
 *   0 — No changes detected
 *   1 — Changes detected (or error)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { computeDiff, hasDiffChanges, formatDiffReport } from '../spec/diff.js';

const rootDir = resolve(import.meta.dirname, '..');
const vendoredPath = join(rootDir, 'spec', 'vendored', 'learn-swagger.json');
const verbose = process.argv.includes('--verbose');

async function main(): Promise<void> {
  // 1. Load vendored spec
  if (!existsSync(vendoredPath)) {
    console.error('No vendored spec found at spec/vendored/learn-swagger.json');
    console.error('Run "npm run spec:vendor" first to create a baseline.');
    process.exit(1);
  }

  const vendoredSpec = JSON.parse(readFileSync(vendoredPath, 'utf-8'));

  // 2. Download fresh spec
  const { downloadSpec } = await import('../spec/download.js');
  console.log('Downloading fresh spec...');
  const freshSpec = await downloadSpec({ forceDownload: true, verbose });

  // 3. Convert both to OpenAPI 3.0 for structural comparison
  const { convertToOpenAPI3 } = await import('../spec/convert.js');
  const vendoredOA3 = await convertToOpenAPI3(vendoredSpec, { verbose });
  const freshOA3 = await convertToOpenAPI3(freshSpec, { verbose });

  // 4. Compute diff
  const diff = computeDiff(vendoredOA3, freshOA3);

  // 5. Report
  console.log(formatDiffReport(diff));

  if (hasDiffChanges(diff)) {
    console.log('\nSpec changes detected. Review the diff and run "npm run spec:vendor" to update.');
    process.exit(1);
  } else {
    console.log('\nNo spec changes detected.');
    process.exit(0);
  }
}

main();
