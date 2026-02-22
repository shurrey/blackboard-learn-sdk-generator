/**
 * Generate consistent {resource}_{action} operation IDs from paths and HTTP methods.
 *
 * Examples:
 *   GET    /learn/api/public/v1/courses                    → courses_list
 *   GET    /learn/api/public/v1/courses/{courseId}          → courses_get
 *   POST   /learn/api/public/v1/courses                    → courses_create
 *   PATCH  /learn/api/public/v1/courses/{courseId}          → courses_update
 *   DELETE /learn/api/public/v1/courses/{courseId}          → courses_delete
 *   GET    /learn/api/public/v1/courses/{courseId}/contents → courses_contents_list
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function pathToOperationId(path: string, method: string): string {
  // Strip the API prefix
  let cleaned = path
    .replace(/^\/learn\/api\/public\/v\d+\//, '')
    .replace(/^\//, '');

  // Split into segments
  const segments = cleaned.split('/');

  // Build resource chain from non-parameter segments
  const resourceParts: string[] = [];
  for (const segment of segments) {
    if (!segment.startsWith('{')) {
      resourceParts.push(segment);
    }
  }

  const resource = resourceParts.join('_');

  // Determine action from HTTP method + whether path ends with a parameter
  const endsWithParam = segments[segments.length - 1]?.startsWith('{');
  let action: string;

  switch (method.toLowerCase()) {
    case 'get':
      action = endsWithParam ? 'get' : 'list';
      break;
    case 'post':
      action = 'create';
      break;
    case 'put':
      action = 'update';
      break;
    case 'patch':
      action = 'update';
      break;
    case 'delete':
      action = 'delete';
      break;
    default:
      action = method.toLowerCase();
  }

  return `${resource}_${action}`;
}

export function fixOperationIds(spec: any): any {
  if (!spec.paths) return spec;

  const usedIds = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths) as [string, any][]) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      let operationId = pathToOperationId(path, method);

      // Handle duplicates by appending a counter
      let finalId = operationId;
      let counter = 2;
      while (usedIds.has(finalId)) {
        finalId = `${operationId}_${counter}`;
        counter++;
      }
      usedIds.add(finalId);

      // Store original for reference
      if (operation.operationId) {
        operation['x-original-operation-id'] = operation.operationId;
      }
      operation.operationId = finalId;
    }
  }

  return spec;
}
