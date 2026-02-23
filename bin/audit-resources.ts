#!/usr/bin/env tsx

/**
 * Audit resource coverage: compare generator.config.yaml entries against the
 * OpenAPI spec to find empty resource entries and suggest operationId mappings.
 *
 * Usage: tsx bin/audit-resources.ts [--verbose]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const rootDir = resolve(import.meta.dirname, '..');
const verbose = process.argv.includes('--verbose');

interface AuditEntry {
  configPath: string;
  isEmpty: boolean;
  specPaths: { path: string; method: string; operationId?: string }[];
}

async function main(): Promise<void> {
  // 1. Load config
  const configPath = resolve(rootDir, 'generator.config.yaml');
  const config = yaml.load(readFileSync(configPath, 'utf-8')) as any;

  // 2. Load and convert spec
  const { runSpecPipeline } = await import('../spec/index.js');
  console.log('Loading spec...');
  const spec = await runSpecPipeline({ forceDownload: false, verbose });

  // 3. Walk config tree and audit
  const entries: AuditEntry[] = [];
  walkConfig(config.resources, '', spec, entries);

  // 4. Report
  console.log('\n=== Resource Coverage Audit ===\n');

  let emptyCount = 0;
  let populatedCount = 0;

  for (const entry of entries) {
    if (entry.isEmpty) {
      emptyCount++;
      console.log(`EMPTY: ${entry.configPath}`);
      if (entry.specPaths.length > 0) {
        console.log(`  Matching spec operations:`);
        for (const sp of entry.specPaths) {
          console.log(`    ${sp.method.toUpperCase().padEnd(7)} ${sp.path}  →  ${sp.operationId ?? '(no operationId)'}`);
        }
      } else {
        console.log(`  No matching spec paths found.`);
      }
      console.log();
    } else {
      populatedCount++;
    }
  }

  console.log(`\nSummary: ${populatedCount} populated, ${emptyCount} empty, ${entries.length} total`);
}

function walkConfig(
  node: any,
  parentPath: string,
  spec: any,
  entries: AuditEntry[]
): void {
  if (!node || typeof node !== 'object') return;

  for (const [name, value] of Object.entries(node)) {
    const configPath = parentPath ? `${parentPath}.${name}` : name;
    const entry = value as any;

    const isEmpty = !entry || (typeof entry === 'object' && !entry.methods && !entry.subresources);
    const specPaths = findMatchingSpecPaths(name, parentPath, spec);

    entries.push({ configPath, isEmpty, specPaths });

    if (verbose) {
      console.log(`  Checking ${configPath}: ${isEmpty ? 'EMPTY' : 'has methods'} (${specPaths.length} spec matches)`);
    }

    // Recurse into subresources
    if (entry?.subresources) {
      walkConfig(entry.subresources, configPath, spec, entries);
    }
  }
}

function findMatchingSpecPaths(
  resourceName: string,
  parentPath: string,
  spec: any
): { path: string; method: string; operationId?: string }[] {
  const results: { path: string; method: string; operationId?: string }[] = [];
  const paths = spec.paths ?? {};

  // Build search patterns from the resource name and parent context
  const segments = parentPath ? [...parentPath.split('.'), resourceName] : [resourceName];
  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

  for (const [apiPath, pathItem] of Object.entries(paths)) {
    // Check if the API path contains the resource name segment
    const pathParts = apiPath.split('/').filter(Boolean);
    const lastNonParam = pathParts.filter(p => !p.startsWith('{')).pop() ?? '';

    if (lastNonParam === resourceName || lastNonParam === resourceName.toLowerCase()) {
      for (const method of HTTP_METHODS) {
        const operation = (pathItem as any)[method];
        if (operation) {
          results.push({
            path: apiPath,
            method,
            operationId: operation.operationId,
          });
        }
      }
    }

    // Also check if path contains the full parent→child hierarchy
    if (segments.length > 1) {
      const pathLower = apiPath.toLowerCase();
      const allMatch = segments.every(seg => pathLower.includes(`/${seg.toLowerCase()}`));
      if (allMatch && !results.some(r => r.path === apiPath)) {
        for (const method of HTTP_METHODS) {
          const operation = (pathItem as any)[method];
          if (operation) {
            results.push({
              path: apiPath,
              method,
              operationId: operation.operationId,
            });
          }
        }
      }
    }
  }

  return results;
}

main();
