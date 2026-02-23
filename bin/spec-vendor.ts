#!/usr/bin/env tsx

/**
 * Vendor (snapshot) the current cached spec into spec/vendored/ for git tracking.
 *
 * Usage: tsx bin/spec-vendor.ts [--from-cache | --from-download]
 *
 * Defaults to --from-cache (uses spec/cache/learn-swagger.json).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const cacheDir = join(rootDir, 'spec', 'cache');
const vendoredDir = join(rootDir, 'spec', 'vendored');
const cachePath = join(cacheDir, 'learn-swagger.json');
const vendoredPath = join(vendoredDir, 'learn-swagger.json');
const metaPath = join(vendoredDir, 'learn-swagger.meta.json');

const fromDownload = process.argv.includes('--from-download');

async function main(): Promise<void> {
  let spec: object;

  if (fromDownload) {
    console.log('Downloading fresh spec...');
    const { downloadSpec } = await import('../spec/download.js');
    spec = await downloadSpec({ forceDownload: true });
  } else {
    if (!existsSync(cachePath)) {
      console.error('No cached spec found at spec/cache/learn-swagger.json');
      console.error('Run "npm run generate -- all" first to download, or use --from-download.');
      process.exit(1);
    }
    spec = JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  // Ensure vendored directory exists
  mkdirSync(vendoredDir, { recursive: true });

  // Write vendored spec
  const specJson = JSON.stringify(spec, null, 2);
  writeFileSync(vendoredPath, specJson);

  // Count paths for summary
  const pathCount = Object.keys((spec as any).paths ?? {}).length;
  const info = (spec as any).info ?? {};

  // Write metadata sidecar
  const meta = {
    vendoredAt: new Date().toISOString(),
    source: fromDownload ? 'download' : 'cache',
    specTitle: info.title ?? 'unknown',
    specVersion: info.version ?? 'unknown',
    pathCount,
    sizeBytes: Buffer.byteLength(specJson, 'utf-8'),
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(`Vendored spec to spec/vendored/learn-swagger.json`);
  console.log(`  Title:    ${meta.specTitle}`);
  console.log(`  Version:  ${meta.specVersion}`);
  console.log(`  Paths:    ${meta.pathCount}`);
  console.log(`  Size:     ${(meta.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  Date:     ${meta.vendoredAt}`);
}

main();
