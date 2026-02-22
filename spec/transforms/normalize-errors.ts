/**
 * Standardize error responses to use RestException schema
 * for 400, 401, 403, 404, 429, and 500 status codes.
 */

const ERROR_CODES = ['400', '401', '403', '404', '429', '500', '502', '503', '504'];

const REST_EXCEPTION_SCHEMA = {
  type: 'object' as const,
  description: 'Blackboard Learn REST API error response.',
  properties: {
    status: { type: 'integer' as const, description: 'HTTP status code' },
    message: { type: 'string' as const, description: 'Human-readable error message' },
    extraInfo: { type: 'string' as const, description: 'Additional error context, if available' },
  },
};

export function normalizeErrors(spec: any): any {
  // Ensure RestException schema exists
  if (!spec.components) spec.components = {};
  if (!spec.components.schemas) spec.components.schemas = {};

  if (!spec.components.schemas.RestException) {
    spec.components.schemas.RestException = REST_EXCEPTION_SCHEMA;
  }

  const restExceptionRef = { $ref: '#/components/schemas/RestException' };

  // Add standard error responses to all operations
  if (!spec.paths) return spec;

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const pathItem of Object.values(spec.paths) as any[]) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      if (!operation.responses) operation.responses = {};

      for (const code of ERROR_CODES) {
        if (!operation.responses[code]) {
          operation.responses[code] = {
            description: getErrorDescription(code),
            content: {
              'application/json': {
                schema: restExceptionRef,
              },
            },
          };
        }
      }
    }
  }

  return spec;
}

function getErrorDescription(code: string): string {
  switch (code) {
    case '400': return 'Bad Request - The request was malformed or contained invalid parameters.';
    case '401': return 'Unauthorized - Authentication credentials are missing or invalid.';
    case '403': return 'Forbidden - The authenticated user does not have permission.';
    case '404': return 'Not Found - The requested resource does not exist.';
    case '429': return 'Too Many Requests - Rate limit exceeded.';
    case '500': return 'Internal Server Error - An unexpected error occurred.';
    case '502': return 'Bad Gateway - The server received an invalid response from an upstream server.';
    case '503': return 'Service Unavailable - The server is temporarily unavailable.';
    case '504': return 'Gateway Timeout - The server did not receive a response from an upstream server.';
    default: return 'Error';
  }
}
