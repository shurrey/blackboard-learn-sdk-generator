/**
 * Ruby-specific Handlebars helpers.
 */

import type { TypeRef, Parameter } from '../../ir/types.js';
import { snakeCase } from '../shared/case-utils.js';

export function typeRefToRubyYard(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToRuby(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      return `Array<${typeRefToRubyYard(type.items)}>`;
    case 'enum':
      return 'String';
    case 'union':
      return 'Object';
    case 'map':
      return `Hash{String => ${typeRefToRubyYard(type.valueType)}}`;
    case 'void':
      return 'void';
    default:
      return 'Object';
  }
}

function primitiveToRuby(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'Time';
      return 'String';
    case 'integer':
      return 'Integer';
    case 'number':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    default:
      return 'Object';
  }
}

export function registerRubyHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('rubyType', (type: TypeRef) => typeRefToRubyYard(type));
  handlebars.registerHelper('rubyMethodParams', function (this: any, method: any) {
    const parts: string[] = [];
    for (const param of method.pathParams ?? []) {
      parts.push(snakeCase(param.name));
    }
    if (method.requestBody) {
      parts.push('body');
    }
    return parts.join(', ');
  });
  handlebars.registerHelper('rubyReturnType', (method: any) => {
    if (method.paginated && method.paginationConfig) {
      return `Enumerator::Lazy<${typeRefToRubyYard(method.paginationConfig.itemType)}>`;
    }
    return typeRefToRubyYard(method.response.type);
  });
  // Convert dot-separated resource path to Ruby accessor chain
  // E.g., "courses.contents.children" -> "courses.contents.children"
  handlebars.registerHelper('rbResourceChain', (path: string) => {
    if (!path) return '';
    return path.split('.').map(s => snakeCase(s)).join('.');
  });
}
