import { describe, it, expect } from 'vitest';
import { fixAuthSchemes } from '../spec/transforms/fix-auth-schemes.js';
import { fixOperationIds } from '../spec/transforms/fix-operation-ids.js';
import { addPaginationExtension } from '../spec/transforms/add-pagination-ext.js';
import { normalizeErrors } from '../spec/transforms/normalize-errors.js';
import { addResourceTags } from '../spec/transforms/add-resource-tags.js';

describe('fixAuthSchemes', () => {
  it('adds OAuth2 security schemes', () => {
    const spec = { components: {} };
    const result = fixAuthSchemes(spec);

    expect(result.components.securitySchemes).toBeDefined();
    expect(result.components.securitySchemes.bearerAuth).toBeDefined();
    expect(result.components.securitySchemes.oauth2_client_credentials).toBeDefined();
    expect(result.components.securitySchemes.oauth2_authorization_code).toBeDefined();
  });
});

describe('fixOperationIds', () => {
  it('generates correct operation IDs', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses': {
          get: { responses: {} },
          post: { responses: {} },
        },
        '/learn/api/public/v1/courses/{courseId}': {
          get: { responses: {} },
          patch: { responses: {} },
          delete: { responses: {} },
        },
      },
    };

    const result = fixOperationIds(spec);

    expect(result.paths['/learn/api/public/v1/courses'].get.operationId).toBe('courses_list');
    expect(result.paths['/learn/api/public/v1/courses'].post.operationId).toBe('courses_create');
    expect(result.paths['/learn/api/public/v1/courses/{courseId}'].get.operationId).toBe('courses_get');
    expect(result.paths['/learn/api/public/v1/courses/{courseId}'].patch.operationId).toBe('courses_update');
    expect(result.paths['/learn/api/public/v1/courses/{courseId}'].delete.operationId).toBe('courses_delete');
  });

  it('handles nested resources', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses/{courseId}/contents': {
          get: { responses: {} },
        },
      },
    };

    const result = fixOperationIds(spec);
    expect(result.paths['/learn/api/public/v1/courses/{courseId}/contents'].get.operationId).toBe('courses_contents_list');
  });
});

describe('addPaginationExtension', () => {
  it('detects paginated endpoints', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses': {
          get: {
            parameters: [
              { name: 'offset', in: 'query' },
              { name: 'limit', in: 'query' },
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        results: { type: 'array', items: { type: 'object' } },
                        paging: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = addPaginationExtension(spec);
    expect(result.paths['/learn/api/public/v1/courses'].get['x-pagination']).toBeDefined();
    expect(result.paths['/learn/api/public/v1/courses'].get['x-pagination'].style).toBe('offset');
  });
});

describe('normalizeErrors', () => {
  it('adds error responses to operations', () => {
    const spec = {
      paths: {
        '/test': {
          get: { responses: { '200': { description: 'OK' } } },
        },
      },
    };

    const result = normalizeErrors(spec);
    expect(result.paths['/test'].get.responses['400']).toBeDefined();
    expect(result.paths['/test'].get.responses['401']).toBeDefined();
    expect(result.paths['/test'].get.responses['404']).toBeDefined();
    expect(result.paths['/test'].get.responses['429']).toBeDefined();
  });

  it('adds RestException schema', () => {
    const spec = { paths: {}, components: { schemas: {} } };
    const result = normalizeErrors(spec);
    expect(result.components.schemas.RestException).toBeDefined();
  });
});

describe('addResourceTags', () => {
  it('adds resource tags to operations', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses/{courseId}/contents': {
          get: { responses: {} },
        },
      },
    };

    const result = addResourceTags(spec);
    expect(result.paths['/learn/api/public/v1/courses/{courseId}/contents'].get['x-resource-tag']).toBe('courses.contents');
    expect(result.paths['/learn/api/public/v1/courses/{courseId}/contents'].get.tags).toEqual(['courses.contents']);
  });
});
