import { fixAuthSchemes } from './fix-auth-schemes.js';
import { fixOperationIds } from './fix-operation-ids.js';
import { addPaginationExtension } from './add-pagination-ext.js';
import { normalizeErrors } from './normalize-errors.js';
import { addResourceTags } from './add-resource-tags.js';

export type Transform = (spec: any) => any;

/**
 * All transforms applied in order. Each receives the full OpenAPI 3.0 spec
 * and returns a modified version.
 */
const TRANSFORMS: Array<{ name: string; fn: Transform }> = [
  { name: 'fix-auth-schemes', fn: fixAuthSchemes },
  { name: 'fix-operation-ids', fn: fixOperationIds },
  { name: 'add-pagination-ext', fn: addPaginationExtension },
  { name: 'normalize-errors', fn: normalizeErrors },
  { name: 'add-resource-tags', fn: addResourceTags },
];

export interface TransformOptions {
  verbose?: boolean;
}

/**
 * Apply all spec transforms sequentially.
 */
export function applyTransforms(spec: any, options: TransformOptions = {}): any {
  let result = structuredClone(spec);

  for (const transform of TRANSFORMS) {
    if (options.verbose) {
      console.log(`  Applying transform: ${transform.name}`);
    }
    result = transform.fn(result);
  }

  return result;
}

export {
  fixAuthSchemes,
  fixOperationIds,
  addPaginationExtension,
  normalizeErrors,
  addResourceTags,
};
