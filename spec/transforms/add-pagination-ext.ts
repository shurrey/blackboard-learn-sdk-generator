/**
 * Detect endpoints returning paginated results (results[] + paging.nextPage pattern)
 * and annotate them with x-pagination extension.
 */

function hasOffsetLimitParams(operation: any, spec: any): boolean {
  const params = operation.parameters ?? [];
  const paramNames = params.map((p: any) => {
    // Dereference $ref parameters to get the actual name
    if (p.$ref) {
      const resolved = resolveRef(p, spec);
      return resolved?.name;
    }
    return p.name;
  });
  return paramNames.includes('offset') && paramNames.includes('limit');
}

function returnsPaginatedShape(operation: any, spec: any): boolean {
  const successResponse = operation.responses?.['200'] ?? operation.responses?.['201'];
  if (!successResponse) return false;

  const content = successResponse.content?.['application/json'];
  if (!content?.schema) return false;

  const schema = resolveRef(content.schema, spec);
  if (!schema?.properties) return false;

  // Check for 'results' array property
  const hasResults = schema.properties.results?.type === 'array' ||
    resolveRef(schema.properties.results, spec)?.type === 'array';

  // Check for 'paging' object
  const hasPaging = schema.properties.paging !== undefined;

  return hasResults && hasPaging;
}

function resolveRef(schema: any, spec: any): any {
  if (!schema) return schema;
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/', '').split('/');
    let current = spec;
    for (const segment of refPath) {
      current = current?.[segment];
    }
    return current;
  }
  return schema;
}

function getResultsItemSchema(operation: any, spec: any): any {
  const successResponse = operation.responses?.['200'] ?? operation.responses?.['201'];
  const content = successResponse?.content?.['application/json'];
  const schema = resolveRef(content?.schema, spec);
  const resultsSchema = resolveRef(schema?.properties?.results, spec);
  if (resultsSchema?.type === 'array' && resultsSchema.items) {
    return resultsSchema.items;
  }
  return null;
}

export function addPaginationExtension(spec: any): any {
  if (!spec.paths) return spec;

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  let paginatedCount = 0;

  for (const [_path, pathItem] of Object.entries(spec.paths) as [string, any][]) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      if (method === 'get' && hasOffsetLimitParams(operation, spec) && returnsPaginatedShape(operation, spec)) {
        const itemSchema = getResultsItemSchema(operation, spec);
        operation['x-pagination'] = {
          style: 'offset',
          offsetParam: 'offset',
          limitParam: 'limit',
          resultsField: 'results',
          pagingField: 'paging',
          nextPageField: 'paging.nextPage',
          ...(itemSchema ? { itemSchema } : {}),
        };
        paginatedCount++;
      }
    }
  }

  return spec;
}
