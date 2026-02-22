import { describe, it, expect } from 'vitest';
import { buildResourceTree, resourceNodeToIR } from '../ir/resource-tree.js';

describe('buildResourceTree', () => {
  it('builds a simple resource from paths', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses': {
          get: {
            operationId: 'courses_list',
            'x-resource-tag': 'courses',
            responses: { '200': { description: 'OK' } },
          },
        },
        '/learn/api/public/v1/courses/{courseId}': {
          get: {
            operationId: 'courses_get',
            'x-resource-tag': 'courses',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const root = buildResourceTree(spec);
    expect(root.children.has('courses')).toBe(true);

    const coursesNode = root.children.get('courses')!;
    expect(coursesNode.name).toBe('courses');
    expect(coursesNode.methods.size).toBe(2);
  });

  it('builds nested resources', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses/{courseId}/contents': {
          get: {
            operationId: 'courses_contents_list',
            'x-resource-tag': 'courses.contents',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const root = buildResourceTree(spec);
    const coursesNode = root.children.get('courses')!;
    expect(coursesNode.children.has('contents')).toBe(true);
  });

  it('converts to IR format', () => {
    const spec = {
      paths: {
        '/learn/api/public/v1/courses': {
          get: {
            operationId: 'courses_list',
            'x-resource-tag': 'courses',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const root = buildResourceTree(spec);
    const resources = resourceNodeToIR(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('courses');
  });
});
