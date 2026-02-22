/**
 * Detects paginated endpoints based on the x-pagination extension
 * (added by the add-pagination-ext transform) and attaches pagination
 * config to Method IR nodes.
 */

import type { MethodPaginationConfig, TypeRef } from './types.js';
import { ModelResolver } from './model-resolver.js';

export function detectPagination(
  operation: any,
  spec: any,
  resolver: ModelResolver
): { paginated: boolean; config?: MethodPaginationConfig } {
  const xPagination = operation['x-pagination'];

  if (!xPagination) {
    return { paginated: false };
  }

  // Determine the item type from the results array
  let itemType: TypeRef = { kind: 'primitive', type: 'string' };

  if (xPagination.itemSchema) {
    itemType = resolver.schemaToTypeRef(xPagination.itemSchema, 'PaginatedItem');
  } else {
    // Try to extract from the response schema
    const successResponse = operation.responses?.['200'];
    if (successResponse) {
      const content = successResponse.content?.['application/json'];
      const schema = content?.schema;
      if (schema) {
        const resolved = resolveRef(schema, spec);
        if (resolved?.properties?.results) {
          const resultsSchema = resolveRef(resolved.properties.results, spec);
          if (resultsSchema?.type === 'array' && resultsSchema.items) {
            itemType = resolver.schemaToTypeRef(resultsSchema.items);
          }
        }
      }
    }
  }

  return {
    paginated: true,
    config: {
      resultsField: xPagination.resultsField ?? 'results',
      itemType,
    },
  };
}

function resolveRef(schema: any, spec: any): any {
  if (!schema?.$ref) return schema;
  const refPath = schema.$ref.replace('#/', '').split('/');
  let current = spec;
  for (const segment of refPath) {
    current = current?.[segment];
  }
  return current;
}
