/**
 * Go-specific Handlebars helpers.
 */

import type { TypeRef, Parameter } from '../../ir/types.js';
import { camelCase, pascalCase } from '../shared/case-utils.js';

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

/**
 * Convert a dot-separated resource path to a Go field accessor chain.
 * E.g., "courses.contents.children" -> "Courses.Contents.Children"
 */
function resourceChainGo(path: string): string {
  if (!path) return '';
  return path.split('.').map(s => pascalCase(s)).join('.');
}

export function registerGoHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('goType', (type: TypeRef) => typeRefToGo(type));
  handlebars.registerHelper('goResourceChain', (path: string) => resourceChainGo(path));
  handlebars.registerHelper('goPointerType', (type: TypeRef) => typeRefToGoPointer(type));
  handlebars.registerHelper('goTag', (name: string) => `\`json:"${name},omitempty"\``);
  handlebars.registerHelper('goTagWithValidation', (name: string, required: boolean, validation: boolean) => {
    if (validation && required) {
      return `\`json:"${name},omitempty" validate:"required"\``;
    }
    return `\`json:"${name},omitempty"\``;
  });
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
  handlebars.registerHelper('goPathParamValue', (param: any) => {
    const varName = camelCase(param.name);
    if (param.type?.kind === 'enum') {
      return `string(${varName})`;
    }
    if (param.type?.kind === 'primitive' && param.type?.type !== 'string') {
      return `fmt.Sprintf("%v", ${varName})`;
    }
    return varName;
  });
  handlebars.registerHelper('goTestValue', (param: any) => {
    if (param.type?.kind === 'enum' && param.type.values?.length > 0) {
      return `${param.type.name}("${param.type.values[0]}")`;
    }
    if (param.type?.kind === 'enum') {
      return `${param.type.name}("test-id")`;
    }
    return `"test-id"`;
  });
  // Like goTestValue but with lms. prefix for use in integration tests (package lms_test)
  handlebars.registerHelper('goIntegrationTestValue', (param: any) => {
    if (param.type?.kind === 'enum' && param.type.values?.length > 0) {
      return `lms.${param.type.name}("${param.type.values[0]}")`;
    }
    if (param.type?.kind === 'enum') {
      return `lms.${param.type.name}("test-id")`;
    }
    return `"test-id"`;
  });
  // Import-checking helpers for conditional imports in resource.hbs
  handlebars.registerHelper('goNeedsContext', (resource: any) => {
    return (resource.methods ?? []).length > 0;
  });
  handlebars.registerHelper('goNeedsFmt', (resource: any) => {
    for (const method of resource.methods ?? []) {
      if (method.requestBody?.binary || method.response?.binary) continue;
      if (method.paginated) continue;
      for (const param of method.pathParams ?? []) {
        if (param.type?.kind === 'primitive' && param.type?.type !== 'string') {
          return true;
        }
      }
    }
    return false;
  });
  handlebars.registerHelper('goNeedsIter', (resource: any) => {
    for (const method of resource.methods ?? []) {
      if (method.paginated) return true;
    }
    return false;
  });
  handlebars.registerHelper('goNeedsTestContext', function (this: any, resource: any, options: any) {
    const hasNonPaginatedMethod = (resource.methods ?? []).some((m: any) => !m.paginated);
    return hasNonPaginatedMethod ? options.fn(this) : options.inverse(this);
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
