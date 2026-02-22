import { describe, it, expect } from 'vitest';
import { ModelResolver } from '../ir/model-resolver.js';

describe('ModelResolver', () => {
  it('resolves a simple object schema', () => {
    const spec = {
      components: {
        schemas: {
          Course: {
            type: 'object',
            description: 'A course',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              enrollmentCount: { type: 'integer' },
            },
            required: ['id', 'name'],
          },
        },
      },
    };

    const resolver = new ModelResolver(spec);
    const { models, enums } = resolver.resolveAll();

    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('Course');
    expect(models[0].properties).toHaveLength(3);
    expect(models[0].required).toEqual(['id', 'name']);
  });

  it('resolves enum schemas', () => {
    const spec = {
      components: {
        schemas: {
          CourseAvailability: {
            type: 'string',
            enum: ['Yes', 'No', 'Disabled'],
          },
        },
      },
    };

    const resolver = new ModelResolver(spec);
    const { models, enums } = resolver.resolveAll();

    expect(enums).toHaveLength(1);
    expect(enums[0].name).toBe('CourseAvailability');
    expect(enums[0].values).toHaveLength(3);
  });

  it('resolves $ref references', () => {
    const spec = {
      components: {
        schemas: {
          Course: {
            type: 'object',
            properties: {
              availability: { $ref: '#/components/schemas/Availability' },
            },
          },
          Availability: {
            type: 'object',
            properties: {
              available: { type: 'string', enum: ['Yes', 'No'] },
            },
          },
        },
      },
    };

    const resolver = new ModelResolver(spec);
    const { models } = resolver.resolveAll();

    const course = models.find(m => m.name === 'Course');
    expect(course).toBeDefined();
    const availProp = course!.properties.find(p => p.name === 'availability');
    expect(availProp?.type.kind).toBe('model');
  });

  it('converts TypeRef correctly', () => {
    const spec = { components: { schemas: {} } };
    const resolver = new ModelResolver(spec);

    const stringType = resolver.schemaToTypeRef({ type: 'string' });
    expect(stringType).toEqual({ kind: 'primitive', type: 'string', format: undefined });

    const intType = resolver.schemaToTypeRef({ type: 'integer', format: 'int64' });
    expect(intType).toEqual({ kind: 'primitive', type: 'integer', format: 'int64' });

    const arrayType = resolver.schemaToTypeRef({ type: 'array', items: { type: 'string' } });
    expect(arrayType.kind).toBe('array');
  });
});
