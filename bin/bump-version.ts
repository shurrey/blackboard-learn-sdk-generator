#!/usr/bin/env tsx

/**
 * Bump the SDK generator version in package.json and generator.config.yaml.
 *
 * Usage: tsx bin/bump-version.ts <major|minor|patch>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const BUMP_TYPES = ['major', 'minor', 'patch'] as const;
type BumpType = typeof BUMP_TYPES[number];

const bumpType = process.argv[2] as BumpType;

if (!BUMP_TYPES.includes(bumpType)) {
  console.error(`Usage: tsx bin/bump-version.ts <major|minor|patch>`);
  console.error(`  Got: ${bumpType ?? '(none)'}`);
  process.exit(1);
}

const rootDir = resolve(import.meta.dirname, '..');

// 1. Read current version from generator.config.yaml
const configPath = resolve(rootDir, 'generator.config.yaml');
const configContent = readFileSync(configPath, 'utf-8');
const config = yaml.load(configContent) as any;
const currentVersion = config.sdk.version as string;

// 2. Bump semver
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion: string;

switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// 3. Update generator.config.yaml
const updatedConfig = configContent.replace(
  /^(\s*version:\s*)"[^"]*"/m,
  `$1"${newVersion}"`
);
writeFileSync(configPath, updatedConfig);

// 4. Update package.json
const pkgPath = resolve(rootDir, 'package.json');
const pkgContent = readFileSync(pkgPath, 'utf-8');
const pkg = JSON.parse(pkgContent);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`${currentVersion} → ${newVersion}`);
