/**
 * Structural diff between two OpenAPI specs.
 *
 * Pure functions — no I/O, no side-effects.
 */

export interface DiffResult {
  addedPaths: string[];
  removedPaths: string[];
  addedOperations: { path: string; method: string }[];
  removedOperations: { path: string; method: string }[];
  addedSchemas: string[];
  removedSchemas: string[];
  modifiedSchemas: string[];
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * Compute structural differences between two OpenAPI specs.
 * Works with both Swagger 2.0 (definitions) and OpenAPI 3.0 (components.schemas).
 */
export function computeDiff(vendored: any, fresh: any): DiffResult {
  const vendoredPaths = new Set(Object.keys(vendored.paths ?? {}));
  const freshPaths = new Set(Object.keys(fresh.paths ?? {}));

  const addedPaths = [...freshPaths].filter(p => !vendoredPaths.has(p));
  const removedPaths = [...vendoredPaths].filter(p => !freshPaths.has(p));

  // Operation-level diff on shared paths
  const addedOperations: { path: string; method: string }[] = [];
  const removedOperations: { path: string; method: string }[] = [];

  const sharedPaths = [...vendoredPaths].filter(p => freshPaths.has(p));
  for (const path of sharedPaths) {
    const vOps = new Set(HTTP_METHODS.filter(m => vendored.paths[path]?.[m]));
    const fOps = new Set(HTTP_METHODS.filter(m => fresh.paths[path]?.[m]));
    for (const m of fOps) {
      if (!vOps.has(m)) addedOperations.push({ path, method: m.toUpperCase() });
    }
    for (const m of vOps) {
      if (!fOps.has(m)) removedOperations.push({ path, method: m.toUpperCase() });
    }
  }

  // Schema-level diff
  const vSchemaKey = vendored.components?.schemas ? 'components' : 'definitions';
  const fSchemaKey = fresh.components?.schemas ? 'components' : 'definitions';
  const vendoredSchemas = new Set(Object.keys(
    (vSchemaKey === 'components' ? vendored.components?.schemas : vendored.definitions) ?? {}
  ));
  const freshSchemas = new Set(Object.keys(
    (fSchemaKey === 'components' ? fresh.components?.schemas : fresh.definitions) ?? {}
  ));

  const addedSchemas = [...freshSchemas].filter(s => !vendoredSchemas.has(s));
  const removedSchemas = [...vendoredSchemas].filter(s => !freshSchemas.has(s));

  // Detect modified schemas (shared schemas with different JSON)
  const modifiedSchemas: string[] = [];
  const sharedSchemas = [...vendoredSchemas].filter(s => freshSchemas.has(s));
  const getSchema = (spec: any, key: string, name: string) =>
    key === 'components' ? spec.components?.schemas?.[name] : spec.definitions?.[name];

  for (const name of sharedSchemas) {
    const vSchema = getSchema(vendored, vSchemaKey, name);
    const fSchema = getSchema(fresh, fSchemaKey, name);
    if (JSON.stringify(vSchema) !== JSON.stringify(fSchema)) {
      modifiedSchemas.push(name);
    }
  }

  return { addedPaths, removedPaths, addedOperations, removedOperations, addedSchemas, removedSchemas, modifiedSchemas };
}

/** Check whether a DiffResult contains any changes. */
export function hasDiffChanges(diff: DiffResult): boolean {
  return (
    diff.addedPaths.length > 0 ||
    diff.removedPaths.length > 0 ||
    diff.addedOperations.length > 0 ||
    diff.removedOperations.length > 0 ||
    diff.addedSchemas.length > 0 ||
    diff.removedSchemas.length > 0 ||
    diff.modifiedSchemas.length > 0
  );
}

/** Format a DiffResult as a human-readable console report. Returns whether changes exist. */
export function formatDiffReport(diff: DiffResult): string {
  const lines: string[] = [];

  if (diff.addedPaths.length > 0) {
    lines.push(`\n+ ${diff.addedPaths.length} new path(s):`);
    for (const p of diff.addedPaths) lines.push(`    + ${p}`);
  }

  if (diff.removedPaths.length > 0) {
    lines.push(`\n- ${diff.removedPaths.length} removed path(s):`);
    for (const p of diff.removedPaths) lines.push(`    - ${p}`);
  }

  if (diff.addedOperations.length > 0) {
    lines.push(`\n+ ${diff.addedOperations.length} new operation(s):`);
    for (const op of diff.addedOperations) lines.push(`    + ${op.method} ${op.path}`);
  }

  if (diff.removedOperations.length > 0) {
    lines.push(`\n- ${diff.removedOperations.length} removed operation(s):`);
    for (const op of diff.removedOperations) lines.push(`    - ${op.method} ${op.path}`);
  }

  if (diff.addedSchemas.length > 0) {
    lines.push(`\n+ ${diff.addedSchemas.length} new schema(s):`);
    for (const s of diff.addedSchemas) lines.push(`    + ${s}`);
  }

  if (diff.removedSchemas.length > 0) {
    lines.push(`\n- ${diff.removedSchemas.length} removed schema(s):`);
    for (const s of diff.removedSchemas) lines.push(`    - ${s}`);
  }

  if (diff.modifiedSchemas.length > 0) {
    lines.push(`\n~ ${diff.modifiedSchemas.length} modified schema(s):`);
    for (const s of diff.modifiedSchemas) lines.push(`    ~ ${s}`);
  }

  if (lines.length === 0) {
    lines.push('No structural changes detected.');
  }

  return lines.join('\n');
}

/** Format a DiffResult as a markdown section suitable for changelogs. */
export function formatDiffMarkdown(diff: DiffResult): string {
  const lines: string[] = [];

  if (diff.addedPaths.length > 0) {
    const listed = diff.addedPaths.map(p => `\`${p}\``).join(', ');
    lines.push(`- Added ${diff.addedPaths.length} new path(s): ${listed}`);
  }

  if (diff.removedPaths.length > 0) {
    const listed = diff.removedPaths.map(p => `\`${p}\``).join(', ');
    lines.push(`- Removed ${diff.removedPaths.length} path(s): ${listed}`);
  }

  if (diff.addedOperations.length > 0) {
    const listed = diff.addedOperations.map(op => `\`${op.method} ${op.path}\``).join(', ');
    lines.push(`- Added ${diff.addedOperations.length} new operation(s): ${listed}`);
  }

  if (diff.removedOperations.length > 0) {
    const listed = diff.removedOperations.map(op => `\`${op.method} ${op.path}\``).join(', ');
    lines.push(`- Removed ${diff.removedOperations.length} operation(s): ${listed}`);
  }

  if (diff.addedSchemas.length > 0) {
    const listed = diff.addedSchemas.map(s => `\`${s}\``).join(', ');
    lines.push(`- Added ${diff.addedSchemas.length} new schema(s): ${listed}`);
  }

  if (diff.removedSchemas.length > 0) {
    const listed = diff.removedSchemas.map(s => `\`${s}\``).join(', ');
    lines.push(`- Removed ${diff.removedSchemas.length} schema(s): ${listed}`);
  }

  if (diff.modifiedSchemas.length > 0) {
    const listed = diff.modifiedSchemas.map(s => `\`${s}\``).join(', ');
    lines.push(`- Modified ${diff.modifiedSchemas.length} schema(s): ${listed}`);
  }

  return lines.join('\n');
}
