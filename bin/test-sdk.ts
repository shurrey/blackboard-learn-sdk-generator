#!/usr/bin/env tsx

/**
 * Run native unit tests for generated SDKs in their native runtimes.
 *
 * Usage: tsx bin/test-sdk.ts <target|all>
 *        tsx bin/test-sdk.ts typescript
 *        tsx bin/test-sdk.ts python
 *        tsx bin/test-sdk.ts all
 */

import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { MockServer } from '../testing/mock-server.js';

const VALID_TARGETS = ['all', 'typescript', 'python', 'java', 'csharp', 'go', 'ruby'] as const;
type Target = typeof VALID_TARGETS[number];

const target = process.argv[2] as Target;

if (!target || !VALID_TARGETS.includes(target)) {
  console.error(`Usage: tsx bin/test-sdk.ts <${VALID_TARGETS.join('|')}>`);
  process.exit(1);
}

const rootDir = resolve(import.meta.dirname, '..');
const outputDir = resolve(rootDir, 'output');

const targets: Target[] = target === 'all'
  ? ['typescript', 'python', 'java', 'csharp', 'go', 'ruby']
  : [target];

interface SDKTestConfig {
  installCommand: string;
  testCommand: string;
  name: string;
}

function getTestConfig(t: Target): SDKTestConfig | null {
  switch (t) {
    case 'typescript':
      return {
        installCommand: 'npm install',
        testCommand: 'npx vitest run',
        name: 'TypeScript (vitest)',
      };
    case 'python':
      return {
        installCommand: 'pip install -e ".[dev]"',
        testCommand: 'pytest tests/ -v',
        name: 'Python (pytest)',
      };
    case 'java':
      return {
        installCommand: 'mvn compile -q',
        testCommand: 'mvn test',
        name: 'Java (Maven)',
      };
    case 'csharp':
      return {
        installCommand: 'dotnet restore',
        testCommand: 'dotnet test',
        name: 'C# (dotnet test)',
      };
    case 'go':
      return {
        installCommand: 'go mod download',
        testCommand: 'go test ./...',
        name: 'Go (go test)',
      };
    case 'ruby':
      return {
        installCommand: 'bundle install',
        testCommand: 'bundle exec rspec',
        name: 'Ruby (rspec)',
      };
    default:
      return null;
  }
}

async function main() {
  const results: { target: string; passed: boolean; error?: string }[] = [];

  // Start Prism mock server for integration tests
  const specPath = resolve(rootDir, 'spec/cache/openapi3.json');
  let server: MockServer | null = null;
  let mockServerUrl = '';

  if (existsSync(specPath)) {
    server = new MockServer({ specPath, verbose: false });
    try {
      console.log('Starting Prism mock server...');
      await server.start();
      mockServerUrl = server.baseUrl;
      console.log(`Mock server running at ${mockServerUrl}\n`);
    } catch (err: any) {
      console.warn(`Could not start mock server: ${err.message}`);
      console.warn('Integration tests will fail — install @stoplight/prism-cli or run unit tests only.\n');
      server = null;
    }
  } else {
    console.warn('No cached OpenAPI spec found — run generate first to enable integration tests.\n');
  }

  try {

  for (const t of targets) {
    const sdkDir = join(outputDir, `blackboard-lms-${t}`);

    if (!existsSync(sdkDir)) {
      console.warn(`SDK not found at ${sdkDir} — run "npm run generate -- ${t}" first`);
      results.push({ target: t, passed: false, error: 'SDK not generated' });
      continue;
    }

    const config = getTestConfig(t);
    if (!config) {
      results.push({ target: t, passed: false, error: 'No test config' });
      continue;
    }

    console.log(`\n=== ${config.name} ===`);
    console.log(`  Directory: ${sdkDir}`);

    const testEnv = {
      ...process.env,
      ...(mockServerUrl ? { MOCK_SERVER_URL: mockServerUrl } : {}),
    };

    try {
      // Install dependencies
      console.log(`  Installing dependencies: ${config.installCommand}`);
      execSync(config.installCommand, {
        cwd: sdkDir,
        stdio: 'pipe',
        env: testEnv,
      });

      // Run tests
      console.log(`  Running tests: ${config.testCommand}`);
      const output = execSync(config.testCommand, {
        cwd: sdkDir,
        stdio: 'pipe',
        env: testEnv,
        encoding: 'utf-8',
      });

      console.log(`  PASSED`);
      results.push({ target: t, passed: true });
    } catch (err: any) {
      const stderr = err.stderr?.toString() ?? '';
      const stdout = err.stdout?.toString() ?? '';
      console.log(`  FAILED`);
      if (stderr) console.log(`  stderr: ${stderr.slice(0, 500)}`);
      if (stdout) console.log(`  stdout: ${stdout.slice(0, 500)}`);
      results.push({ target: t, passed: false, error: err.message?.slice(0, 200) });
    }
  }

  // Summary
  console.log('\n=== SDK Test Summary ===');
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${r.target}${r.error ? ` (${r.error})` : ''}`);
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} target(s).`);

  if (failed > 0) {
    process.exit(1);
  }

  } finally {
    // Stop mock server
    if (server) {
      console.log('Stopping mock server...');
      await server.stop();
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
