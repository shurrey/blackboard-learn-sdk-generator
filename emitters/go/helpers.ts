/**
 * Go-specific Handlebars helpers.
 */

import type { TypeRef, Parameter } from '../../ir/types.js';
import { camelCase } from '../shared/case-utils.js';

export function typeRefToGo(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToGo(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      return `[]${typeRefToGo(type.items)}`;
    case 'enum':
      return type.name;
    case 'union':
      return 'interface{}';
    case 'map':
      return `map[string]${typeRefToGo(type.valueType)}`;
    case 'void':
      return '';
    default:
      return 'interface{}';
  }
}

function primitiveToGo(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'time.Time';
      return 'string';
    case 'integer':
      if (format === 'int64') return 'int64';
      return 'int';
    case 'number':
      if (format === 'float') return 'float32';
      return 'float64';
    case 'boolean':
      return 'bool';
    default:
      return 'interface{}';
  }
}

export function typeRefToGoPointer(type: TypeRef): string {
  const goType = typeRefToGo(type);
  if (['string', 'int', 'int64', 'float32', 'float64', 'bool'].includes(goType)) {
    return `*${goType}`;
  }
  return goType;
}

export function registerGoHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('goType', (type: TypeRef) => typeRefToGo(type));
  handlebars.registerHelper('goPointerType', (type: TypeRef) => typeRefToGoPointer(type));
  handlebars.registerHelper('goTag', (name: string) => `\`json:"${name},omitempty"\``);
  handlebars.registerHelper('goMethodParams', function (this: any, method: any) {
    const parts: string[] = ['ctx context.Context'];
    for (const param of method.pathParams ?? []) {
      parts.push(`${camelCase(param.name)} ${typeRefToGo(param.type)}`);
    }
    if (method.requestBody) {
      parts.push(`body *${typeRefToGo(method.requestBody.type)}`);
    }
    return parts.join(', ');
  });
  handlebars.registerHelper('goTestValue', (param: any) => {
    if (param.type?.kind === 'enum') {
      return `${param.type.name}("test-id")`;
    }
    return `"test-id"`;
  });
  handlebars.registerHelper('goReturnType', (method: any) => {
    if (method.paginated && method.paginationConfig) {
      return `iter.Seq2[${typeRefToGo(method.paginationConfig.itemType)}, error]`;
    }
    const retType = typeRefToGo(method.response.type);
    if (!retType) return 'error';
    return `(*${retType}, error)`;
  });
}
