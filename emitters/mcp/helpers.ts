/**
 * MCP emitter-specific Handlebars helpers.
 */

import type { TypeRef } from '../../ir/types.js';

/**
 * Convert a TypeRef to a Python type hint string.
 */
export function typeRefToPython(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToPython(type.type, type.format);
    case 'model':
      return `dict`;
    case 'array':
      return `list[${typeRefToPython(type.items)}]`;
    case 'enum':
      return 'str';
    case 'union':
      return type.types.map(t => typeRefToPython(t)).join(' | ');
    case 'map':
      return `dict[str, ${typeRefToPython(type.valueType)}]`;
    case 'void':
      return 'None';
    default:
      return 'Any';
  }
}

function primitiveToPython(type: string, format?: string): string {
  switch (type) {
    case 'string':
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
 * Generate a Python docstring.
 */
export function pythonDocstring(text: string | undefined, indent: number = 4): string {
  if (!text) return '';
  const pad = ' '.repeat(indent);
  const lines = text.trim().split('\n');
  if (lines.length === 1) {
    return `${pad}"""${lines[0]}"""`;
  }
  return [
    `${pad}"""`,
    ...lines.map(line => `${pad}${line}`),
    `${pad}"""`,
  ].join('\n');
}

/**
 * Build a Literal type from enum values.
 */
export function literalType(values: string[]): string {
  return `Literal[${values.map(v => `"${v}"`).join(', ')}]`;
}

/**
 * Register all MCP/Python helpers with Handlebars.
 */
export function registerMCPHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('pyType', (type: TypeRef) => typeRefToPython(type));
  handlebars.registerHelper('pyDocstring', (text: string, indent: number) =>
    pythonDocstring(text, typeof indent === 'number' ? indent : 4)
  );
  handlebars.registerHelper('literalType', (values: string[]) => literalType(values));
  handlebars.registerHelper('pyDefault', (value: any) => {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    return String(value);
  });
}
