/**
 * Classifies operations into standard CRUD method kinds (list, get, create, update, delete)
 * plus custom actions.
 */

import type { MethodKind } from './types.js';

interface ClassificationInput {
  httpMethod: string;
  path: string;
  operationId?: string;
}

/**
 * Classify an operation into a standard method kind.
 */
export function classifyMethod(input: ClassificationInput): { kind: MethodKind; name: string } {
  const { httpMethod, path } = input;
  const method = httpMethod.toUpperCase();
  const endsWithParam = path.split('/').pop()?.startsWith('{') ?? false;

  // Standard CRUD classification
  switch (method) {
    case 'GET':
      if (endsWithParam) {
        return { kind: 'get', name: 'get' };
      }
      return { kind: 'list', name: 'list' };

    case 'POST':
      return { kind: 'create', name: 'create' };

    case 'PUT':
      return { kind: 'replace', name: 'replace' };

    case 'PATCH':
      return { kind: 'update', name: 'update' };

    case 'DELETE':
      return { kind: 'delete', name: 'delete' };

    default:
      return { kind: 'action', name: method.toLowerCase() };
  }
}

/**
 * For resources with multiple methods of the same kind (e.g., two POSTs),
 * disambiguate by appending a qualifier derived from the path.
 */
export function disambiguateMethodName(
  baseName: string,
  path: string,
  existingNames: Set<string>
): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  // Extract the last non-param path segment for disambiguation
  const segments = path.split('/').filter(s => !s.startsWith('{') && s.length > 0);
  const lastSegment = segments[segments.length - 1];

  if (lastSegment) {
    const qualified = `${baseName}_${lastSegment}`;
    if (!existingNames.has(qualified)) {
      return qualified;
    }
  }

  // Fallback: append a counter
  let counter = 2;
  let candidate = `${baseName}_${counter}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${baseName}_${counter}`;
  }
  return candidate;
}
