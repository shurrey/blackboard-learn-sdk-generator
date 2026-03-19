/**
 * C#-specific Handlebars helpers.
 */

import type { TypeRef, Parameter } from '../../ir/types.js';
import { camelCase, pascalCase } from '../shared/case-utils.js';

export function typeRefToCSharp(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToCSharp(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      return `List<${typeRefToCSharp(type.items)}>`;
    case 'enum':
      return type.name;
    case 'union':
      return 'object';
    case 'map':
      return `Dictionary<string, ${typeRefToCSharp(type.valueType)}>`;
    case 'void':
      return 'void';
    default:
      return 'object';
  }
}

function primitiveToCSharp(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'DateTimeOffset';
      return 'string';
    case 'integer':
      if (format === 'int64') return 'long';
      return 'int';
    case 'number':
      if (format === 'float') return 'float';
      return 'double';
    case 'boolean':
      return 'bool';
    default:
      return 'object';
  }
}

export function typeRefToNullable(type: TypeRef): string {
  const csType = typeRefToCSharp(type);
  // Value types need ? for nullable
  if (['int', 'long', 'double', 'float', 'bool', 'DateTimeOffset'].includes(csType)) {
    return `${csType}?`;
  }
  return `${csType}?`;
}

export function registerCSharpHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('csType', (type: TypeRef) => typeRefToCSharp(type));
  handlebars.registerHelper('csNullableType', (type: TypeRef) => typeRefToNullable(type));
  handlebars.registerHelper('csMethodParams', function (this: any, method: any) {
    const parts: string[] = [];
    for (const param of method.pathParams ?? []) {
      parts.push(`${typeRefToCSharp(param.type)} ${camelCase(param.name)}`);
    }
    if (method.requestBody) {
      parts.push(`${typeRefToCSharp(method.requestBody.type)} body`);
    }
    return parts.join(', ');
  });
  handlebars.registerHelper('csTestValue', (param: any) => {
    if (param.type?.kind === 'enum') {
      return `default(${param.type.name})`;
    }
    return '"test-id"';
  });
  handlebars.registerHelper('csReturnType', (method: any) => {
    if (method.paginated && method.paginationConfig) {
      return `IAsyncEnumerable<${typeRefToCSharp(method.paginationConfig.itemType)}>`;
    }
    if (method.response.type.kind === 'void') return 'Task';
    return `Task<${typeRefToCSharp(method.response.type)}>`;
  });
  // Convert dot-separated resource path to C# accessor chain
  // E.g., "courses.contents.children" -> "Courses.Contents.Children"
  handlebars.registerHelper('csResourceChain', (path: string) => {
    if (!path) return '';
    return path.split('.').map(s => pascalCase(s)).join('.');
  });
}
