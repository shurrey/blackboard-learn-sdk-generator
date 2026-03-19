#!/usr/bin/env tsx

/**
 * Run integration tests for a generated SDK against a Prism mock server.
 *
 * Usage: tsx bin/test-integration.ts <target>
 *        tsx bin/test-integration.ts typescript
 *        tsx bin/test-integration.ts all
 */

import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { MockServer } from '../testing/mock-server.js';

const VALID_TARGETS = ['all', 'typescript', 'python', 'java', 'csharp', 'go', 'ruby'] as const;
type Target = typeof VALID_TARGETS[number];

const target = process.argv[2] as Target;

if (!target || !VALID_TARGETS.includes(target)) {
  console.error(`Usage: tsx bin/test-integration.ts <${VALID_TARGETS.join('|')}>`);
  process.exit(1);
}

const rootDir = resolve(import.meta.dirname, '..');
const outputDir = resolve(rootDir, 'output');

// Determine the spec path for the mock server
const specCachePath = resolve(rootDir, 'spec/cache/openapi3.json');

if (!existsSync(specCachePath)) {
  console.error('No cached spec found. Run `npm run generate -- <target>` first to download and cache the spec.');
  process.exit(1);
}

const targets: Target[] = target === 'all'
  ? ['typescript', 'python', 'java', 'csharp', 'go', 'ruby']
  : [target];

interface TestCommand {
  cwd: string;
  command: string;
  name: string;
}

function getTestCommand(t: Target): TestCommand | null {
  const sdkDir = join(outputDir, `blackboard-lms-${t}`);

  if (!existsSync(sdkDir)) {
    console.warn(`  SDK not found at ${sdkDir} — run generate first`);
    return null;
  }

  switch (t) {
    case 'typescript':
      return {
        cwd: sdkDir,
        command: 'npx vitest run tests/integration/',
        name: 'TypeScript (vitest)',
      };
    case 'python':
      return {
        cwd: sdkDir,
        command: 'python -m pytest tests/integration/ -v',
        name: 'Python (pytest)',
      };
    case 'java':
      return {
        cwd: sdkDir,
        command: 'mvn test -Dtest=IntegrationTest -pl .',
        name: 'Java (Maven)',
      };
    case 'csharp':
      return {
        cwd: sdkDir,
        command: 'dotnet test --filter "FullyQualifiedName~Integration"',
        name: 'C# (dotnet test)',
      };
    case 'go':
      return {
        cwd: sdkDir,
        command: 'go test -run TestIntegration -v .',
        name: 'Go (go test)',
      };
    case 'ruby':
      return {
        cwd: sdkDir,
        command: 'bundle exec rspec spec/integration/',
        name: 'Ruby (rspec)',
      };
    default:
      return null;
  }
}

async function main() {
  console.log('Starting Prism mock server...');
  const server = new MockServer({
    specPath: specCachePath,
    verbose: false,
  });

  try {
    await server.start();
    console.log(`Mock server running at ${server.baseUrl}\n`);

    const results: { target: string; passed: boolean; error?: string }[] = [];

    for (const t of targets) {
      const cmd = getTestCommand(t);
      if (!cmd) {
        results.push({ target: t, passed: false, error: 'SDK not found' });
        continue;
      }

      console.log(`Running ${cmd.name} integration tests...`);
      try {
        execSync(cmd.command, {
          cwd: cmd.cwd,
          stdio: 'inherit',
          env: {
            ...process.env,
            MOCK_SERVER_URL: server.baseUrl,
          },
        });
        results.push({ target: t, passed: true });
        console.log(`  PASSED\n`);
      } catch (err: any) {
        results.push({ target: t, passed: false, error: err.message });
        console.log(`  FAILED\n`);
      }
    }

    // Summary
    console.log('\n=== Integration Test Summary ===');
    for (const r of results) {
      const icon = r.passed ? 'PASS' : 'FAIL';
      console.log(`  ${icon} ${r.target}${r.error ? ` (${r.error})` : ''}`);
    }

    const failed = results.filter(r => !r.passed).length;
    if (failed > 0) {
      console.log(`\n${failed} target(s) failed.`);
      process.exit(1);
    } else {
      console.log(`\nAll ${results.length} target(s) passed.`);
    }
  } finally {
    console.log('\nStopping mock server...');
    await server.stop();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
