#!/usr/bin/env tsx

/**
 * Generate a changelog entry from git log since the last tag.
 * Groups commits by conventional-commit prefix and prepends a new section
 * to CHANGELOG.md.
 *
 * Usage: tsx bin/changelog.ts
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const rootDir = resolve(import.meta.dirname, '..');

// Read current version from generator.config.yaml
const configPath = resolve(rootDir, 'generator.config.yaml');
const config = yaml.load(readFileSync(configPath, 'utf-8')) as any;
const version = config.sdk.version as string;

// Get the latest tag
let lastTag: string | null = null;
try {
  lastTag = execSync('git describe --tags --abbrev=0', {
    cwd: rootDir,
    encoding: 'utf-8',
  }).trim();
} catch {
  // No tags yet — use all history
}

// Get commit log since last tag (or all commits)
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
let rawLog: string;
try {
  rawLog = execSync(`git log ${range} --pretty=format:"%s"`, {
    cwd: rootDir,
    encoding: 'utf-8',
  }).trim();
} catch {
  console.log('No commits found.');
  process.exit(0);
}

if (!rawLog) {
  console.log('No new commits since last tag.');
  process.exit(0);
}

// Group commits by conventional-commit prefix
const groups: Record<string, string[]> = {
  feat: [],
  fix: [],
  refactor: [],
  docs: [],
  test: [],
  chore: [],
  other: [],
};

const prefixLabels: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Chores',
  other: 'Other',
};

for (const line of rawLog.split('\n')) {
  const match = line.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);
  if (match) {
    const prefix = match[1].toLowerCase();
    const message = match[2];
    if (groups[prefix]) {
      groups[prefix].push(message);
    } else {
      groups.other.push(line);
    }
  } else {
    groups.other.push(line);
  }
}

// Build changelog section
const date = new Date().toISOString().slice(0, 10);
const lines: string[] = [`## [${version}] - ${date}`, ''];

for (const [key, label] of Object.entries(prefixLabels)) {
  const items = groups[key];
  if (items && items.length > 0) {
    lines.push(`### ${label}`, '');
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
}

const newSection = lines.join('\n');

// Prepend to CHANGELOG.md
const changelogPath = resolve(rootDir, 'CHANGELOG.md');
let existing = '';
if (existsSync(changelogPath)) {
  existing = readFileSync(changelogPath, 'utf-8');
}

const header = existing.startsWith('# Changelog')
  ? ''
  : '# Changelog\n\n';

if (existing.startsWith('# Changelog')) {
  // Insert after the first line
  const rest = existing.slice(existing.indexOf('\n') + 1);
  writeFileSync(changelogPath, `# Changelog\n\n${newSection}\n${rest}`);
} else {
  writeFileSync(changelogPath, `${header}${newSection}\n${existing}`);
}

console.log(`Changelog updated for v${version}`);
