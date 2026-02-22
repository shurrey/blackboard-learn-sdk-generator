/**
 * Python-specific Handlebars helpers.
 */

import type { TypeRef, Parameter, Method, ModelProperty } from '../../ir/types.js';
import { snakeCase } from '../shared/case-utils.js';

/**
 * Convert a TypeRef to a Python type hint string.
 */
export function typeRefToPy(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToPy(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      return `list[${typeRefToPy(type.items)}]`;
    case 'enum':
      return type.name;
    case 'union':
      return type.types.map(t => typeRefToPy(t)).join(' | ');
    case 'map':
      return `dict[str, ${typeRefToPy(type.valueType)}]`;
    case 'void':
      return 'None';
    default:
      return 'Any';
  }
}

function primitiveToPy(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'datetime';
      if (format === 'binary') return 'bytes';
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    default:
      return 'Any';
  }
}

/**
 * Generate a Python docstring (triple-quoted).
 */
export function pyDocstring(text: string | undefined, indent: number = 0): string {
  if (!text) return '';
  const pad = ' '.repeat(indent);
  const lines = text.split('\n');
  if (lines.length === 1 && lines[0].length < 72) {
    return `${pad}"""${lines[0]}"""`;
  }
  return [
    `${pad}"""`,
    ...lines.map(line => `${pad}${line}`),
    `${pad}"""`,
  ].join('\n');
}

/**
 * Generate Python method parameters for a method signature.
 */
export function pyMethodParams(method: Method): string {
  const parts: string[] = ['self'];

  // Path params come first as positional args
  for (const param of method.pathParams ?? []) {
    parts.push(`${snakeCase(param.name)}: ${typeRefToPy(param.type)}`);
  }

  // Request body as keyword argument
  if (method.requestBody) {
    const bodyType = typeRefToPy(method.requestBody.type);
    if (method.requestBody.required) {
      parts.push(`body: ${bodyType}`);
    } else {
      parts.push(`body: Optional[${bodyType}] = None`);
    }
  }

  // Query params as keyword arguments with defaults
  for (const param of method.queryParams ?? []) {
    const pyType = typeRefToPy(param.type);
    if (param.required) {
      parts.push(`${snakeCase(param.name)}: ${pyType}`);
    } else if (param.defaultValue !== undefined) {
      parts.push(`${snakeCase(param.name)}: ${pyType} = ${formatPyDefault(param.defaultValue, param.type)}`);
    } else {
      parts.push(`${snakeCase(param.name)}: Optional[${pyType}] = None`);
    }
  }

  return parts.join(',\n        ');
}

/**
 * Format a default value for Python.
 */
function formatPyDefault(value: any, type: TypeRef): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

/**
 * Generate Python return type hint for a method.
 */
export function pyReturnType(method: Method): string {
  if (method.paginated && method.paginationConfig) {
    return `Iterator[${typeRefToPy(method.paginationConfig.itemType)}]`;
  }
  const rt = typeRefToPy(method.response.type);
  return rt === 'None' ? 'None' : rt;
}

/**
 * Check if any property in a type needs Optional import.
 */
export function needsOptionalImport(properties: ModelProperty[]): boolean {
  return properties.some(p => !p.required);
}

/**
 * Check if any property uses datetime.
 */
export function needsDatetimeImport(properties: ModelProperty[]): boolean {
  return properties.some(p => hasDatetime(p.type));
}

function hasDatetime(type: TypeRef): boolean {
  switch (type.kind) {
    case 'primitive':
      return type.format === 'date-time';
    case 'array':
      return hasDatetime(type.items);
    case 'union':
      return type.types.some(t => hasDatetime(t));
    case 'map':
      return hasDatetime(type.valueType);
    default:
      return false;
  }
}

/**
 * Register all Python helpers with Handlebars.
 */
export function registerPyHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('pyType', (type: TypeRef) => typeRefToPy(type));
  handlebars.registerHelper('pyDocstring', (text: string, indent: any) =>
    pyDocstring(text, typeof indent === 'number' ? indent : 0)
  );
  handlebars.registerHelper('pyMethodParams', function (this: any, method: any) {
    return pyMethodParams(method);
  });
  handlebars.registerHelper('pyReturnType', (method: any) => pyReturnType(method));
  handlebars.registerHelper('needsOptional', (properties: ModelProperty[]) =>
    needsOptionalImport(properties ?? [])
  );
  handlebars.registerHelper('needsDatetime', (properties: ModelProperty[]) =>
    needsDatetimeImport(properties ?? [])
  );
  handlebars.registerHelper('pyDefault', (value: any, type: TypeRef) =>
    formatPyDefault(value, type)
  );
  handlebars.registerHelper('pyOptionalType', (type: TypeRef) =>
    `Optional[${typeRefToPy(type)}]`
  );
  handlebars.registerHelper('pyFieldDescription', (text: string) => {
    if (!text) return '';
    // Escape quotes for use in Field(description="...")
    return text.replace(/"/g, '\\"').replace(/\n/g, ' ');
  });
}
