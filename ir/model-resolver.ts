/**
 * Resolves OpenAPI schema references ($ref) into typed IR models.
 */

import type { Model, ModelProperty, TypeRef, EnumDef, ModelUsage } from './types.js';

export class ModelResolver {
  private models = new Map<string, Model>();
  private enums = new Map<string, EnumDef>();
  private spec: any;
  private resolvedRefs = new Set<string>();

  constructor(spec: any) {
    this.spec = spec;
  }

  /**
   * Resolve all schemas from the spec into IR models and enums.
   */
  resolveAll(): { models: Model[]; enums: EnumDef[] } {
    const schemas = this.spec.components?.schemas ?? {};

    for (const [name, schema] of Object.entries(schemas) as [string, any][]) {
      this.resolveSchema(name, schema);
    }

    return {
      models: Array.from(this.models.values()),
      enums: Array.from(this.enums.values()),
    };
  }

  /**
   * Resolve a single schema into a model or enum.
   */
  resolveSchema(name: string, schema: any): void {
    if (this.resolvedRefs.has(name)) return;
    this.resolvedRefs.add(name);

    const resolved = this.deref(schema);

    // Handle enum schemas
    if (resolved.enum && resolved.type === 'string') {
      this.enums.set(name, {
        name: this.toModelName(name),
        description: resolved.description,
        values: resolved.enum.map((v: string) => ({
          value: v,
          description: undefined,
        })),
      });
      return;
    }

    // Skip non-object schemas
    if (resolved.type !== 'object' && !resolved.properties && !resolved.allOf) {
      return;
    }

    // Handle allOf (composition/inheritance)
    let effectiveSchema = resolved;
    if (resolved.allOf) {
      effectiveSchema = this.mergeAllOf(resolved.allOf);
      effectiveSchema.description = effectiveSchema.description ?? resolved.description;
    }

    const properties: ModelProperty[] = [];
    const required = new Set<string>(effectiveSchema.required ?? []);

    for (const [propName, propSchema] of Object.entries(effectiveSchema.properties ?? {}) as [string, any][]) {
      const resolvedProp = this.deref(propSchema);

      // Extract inline enums
      if (resolvedProp.enum && resolvedProp.type === 'string') {
        const enumName = `${this.toModelName(name)}${this.toPascalCase(propName)}`;
        this.enums.set(enumName, {
          name: enumName,
          description: resolvedProp.description,
          values: resolvedProp.enum.map((v: string) => ({ value: v })),
        });
      }

      properties.push({
        name: propName,
        canonicalName: this.toCamelCase(propName),
        description: resolvedProp.description,
        type: this.schemaToTypeRef(resolvedProp, `${name}_${propName}`),
        required: required.has(propName),
        readOnly: resolvedProp.readOnly ?? false,
        writeOnly: resolvedProp.writeOnly ?? false,
        defaultValue: resolvedProp.default,
        deprecated: resolvedProp.deprecated ?? false,
      });
    }

    const usage = this.inferUsage(name);

    this.models.set(name, {
      name: this.toModelName(name),
      description: effectiveSchema.description,
      properties,
      required: Array.from(required),
      usage,
      originalName: name,
    });
  }

  /**
   * Return all collected enums (including those added during type resolution).
   */
  getEnums(): EnumDef[] {
    return Array.from(this.enums.values());
  }

  /**
   * Convert an OpenAPI schema to a TypeRef.
   */
  schemaToTypeRef(schema: any, context?: string): TypeRef {
    if (!schema) return { kind: 'void' };

    const resolved = this.deref(schema);

    // $ref to a named schema
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      // Ensure the referenced schema is resolved
      const refSchema = this.spec.components?.schemas?.[refName];
      if (refSchema) {
        this.resolveSchema(refName, refSchema);

        // Check if it resolved to an enum
        if (this.enums.has(refName)) {
          const enumDef = this.enums.get(refName)!;
          return { kind: 'enum', name: enumDef.name, values: enumDef.values.map(v => v.value) };
        }

        return { kind: 'model', name: this.toModelName(refName) };
      }
    }

    // Inline enum
    if (resolved.enum && resolved.type === 'string') {
      const enumName = context ? this.toPascalCase(context) : 'Unknown';
      // Register the enum if not already known (e.g., from a path parameter)
      if (enumName !== 'Unknown' && !this.enums.has(enumName)) {
        this.enums.set(enumName, {
          name: enumName,
          description: resolved.description,
          values: resolved.enum.map((v: string) => ({ value: v })),
        });
      }
      return { kind: 'enum', name: enumName, values: resolved.enum };
    }

    // Array
    if (resolved.type === 'array') {
      return {
        kind: 'array',
        items: this.schemaToTypeRef(resolved.items, context ? `${context}_item` : undefined),
      };
    }

    // Object with additionalProperties (map)
    if (resolved.type === 'object' && resolved.additionalProperties && !resolved.properties) {
      return {
        kind: 'map',
        valueType: this.schemaToTypeRef(resolved.additionalProperties, context),
      };
    }

    // Inline object with properties
    if (resolved.type === 'object' && resolved.properties) {
      // Create an inline model
      if (context) {
        const modelName = this.toPascalCase(context);
        this.resolveSchema(context, resolved);
        return { kind: 'model', name: modelName };
      }
      return { kind: 'map', valueType: { kind: 'primitive', type: 'string' } };
    }

    // oneOf / anyOf
    if (resolved.oneOf || resolved.anyOf) {
      const schemas = resolved.oneOf ?? resolved.anyOf;
      return {
        kind: 'union',
        types: schemas.map((s: any, i: number) =>
          this.schemaToTypeRef(s, context ? `${context}_${i}` : undefined)
        ),
      };
    }

    // Primitives
    switch (resolved.type) {
      case 'string':
        return { kind: 'primitive', type: 'string', format: resolved.format };
      case 'integer':
        return { kind: 'primitive', type: 'integer', format: resolved.format };
      case 'number':
        return { kind: 'primitive', type: 'number', format: resolved.format };
      case 'boolean':
        return { kind: 'primitive', type: 'boolean' };
      default:
        // Default to string for unknown types
        return { kind: 'primitive', type: 'string' };
    }
  }

  /**
   * Dereference a $ref schema.
   */
  private deref(schema: any): any {
    if (!schema?.$ref) return schema ?? {};

    const refPath = schema.$ref.replace('#/', '').split('/');
    let current = this.spec;
    for (const segment of refPath) {
      current = current?.[segment];
    }
    return current ?? schema;
  }

  /**
   * Merge allOf schemas into a single effective schema.
   */
  private mergeAllOf(schemas: any[]): any {
    const merged: any = { type: 'object', properties: {}, required: [] };

    for (const schema of schemas) {
      const resolved = this.deref(schema);
      if (resolved.properties) {
        Object.assign(merged.properties, resolved.properties);
      }
      if (resolved.required) {
        merged.required.push(...resolved.required);
      }
      if (resolved.description && !merged.description) {
        merged.description = resolved.description;
      }
    }

    return merged;
  }

  /**
   * Infer whether a model is used for responses, requests, or both.
   */
  private inferUsage(name: string): ModelUsage {
    const lower = name.toLowerCase();
    if (lower.includes('create') || lower.includes('input')) return 'create';
    if (lower.includes('update') || lower.includes('patch')) return 'update';
    return 'response'; // Default — the builder can update this later
  }

  private toModelName(name: string): string {
    return this.toPascalCase(name);
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[_\-\.\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}
