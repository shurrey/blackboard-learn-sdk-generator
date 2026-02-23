/**
 * TypeScript-specific Handlebars helpers.
 */

import type { TypeRef, Parameter, Model, ModelProperty } from '../../ir/types.js';
import { camelCase } from '../shared/case-utils.js';

/**
 * Convert a TypeRef to a TypeScript type string.
 */
export function typeRefToTS(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToTS(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      const inner = typeRefToTS(type.items);
      return `${inner}[]`;
    case 'enum':
      return type.name;
    case 'union':
      return type.types.map(t => typeRefToTS(t)).join(' | ');
    case 'map':
      return `Record<string, ${typeRefToTS(type.valueType)}>`;
    case 'void':
      return 'void';
    default:
      return 'unknown';
  }
}

function primitiveToTS(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'string'; // ISO 8601 string
      if (format === 'binary') return 'Blob';
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

/**
 * Generate a JSDoc comment block.
 */
export function jsDocComment(text: string | undefined, indent: number = 0): string {
  if (!text) return '';
  const pad = ' '.repeat(indent);
  const lines = text.split('\n');
  if (lines.length === 1) {
    return `${pad}/** ${lines[0]} */`;
  }
  return [
    `${pad}/**`,
    ...lines.map(line => `${pad} * ${line}`),
    `${pad} */`,
  ].join('\n');
}

/**
 * Generate method parameters signature.
 */
export function methodParams(pathParams: Parameter[], queryParams: Parameter[], hasBody: boolean, bodyTypeName?: string): string {
  const parts: string[] = [];

  // Path params come first as positional args
  for (const param of pathParams) {
    parts.push(`${camelCase(param.name)}: ${typeRefToTS(param.type)}`);
  }

  // Request body
  if (hasBody && bodyTypeName) {
    parts.push(`body: ${bodyTypeName}`);
  }

  // Query params as optional options object
  // Keys are quoted to support names with dots (e.g., 'availability.available'),
  // and use the original API name since the object is passed through to the HTTP client.
  if (queryParams.length > 0) {
    parts.push(`options?: { ${queryParams.map(p => `'${p.name}'?: ${typeRefToTS(p.type)}`).join('; ')} }`);
  }

  return parts.join(', ');
}

/**
 * Convert a TypeRef to a Zod schema expression.
 */
export function typeRefToZod(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToZod(type.type);
    case 'model':
      return 'z.object({}).passthrough()';
    case 'array':
      return `z.array(${typeRefToZod(type.items)})`;
    case 'enum':
      if (type.values && type.values.length > 0) {
        const vals = type.values.map(v => `'${v}'`).join(', ');
        return `z.enum([${vals}])`;
      }
      return 'z.string()';
    case 'union':
      if (type.types.length === 0) return 'z.unknown()';
      if (type.types.length === 1) return typeRefToZod(type.types[0]);
      return `z.union([${type.types.map(t => typeRefToZod(t)).join(', ')}])`;
    case 'map':
      return `z.record(z.string(), ${typeRefToZod(type.valueType)})`;
    case 'void':
      return 'z.void()';
    default:
      return 'z.unknown()';
  }
}

function primitiveToZod(type: string): string {
  switch (type) {
    case 'string':
      return 'z.string()';
    case 'integer':
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    default:
      return 'z.unknown()';
  }
}

/**
 * Register all TypeScript helpers with Handlebars.
 */
export function registerTSHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('tsType', (type: TypeRef) => typeRefToTS(type));
  handlebars.registerHelper('zodType', (type: TypeRef) => typeRefToZod(type));
  handlebars.registerHelper('jsDoc', (text: string, indent: number) =>
    jsDocComment(text, typeof indent === 'number' ? indent : 0)
  );
  handlebars.registerHelper('tsMethodParams', function (this: any, method: any) {
    const bodyTypeName = method.requestBody ? typeRefToTS(method.requestBody.type) : undefined;
    return methodParams(
      method.pathParams ?? [],
      method.queryParams ?? [],
      !!method.requestBody,
      bodyTypeName
    );
  });
  handlebars.registerHelper('tsReturnType', (method: any) => {
    if (method.paginated && method.paginationConfig) {
      return `AsyncIterable<${typeRefToTS(method.paginationConfig.itemType)}>`;
    }
    return `Promise<${typeRefToTS(method.response.type)}>`;
  });
}
