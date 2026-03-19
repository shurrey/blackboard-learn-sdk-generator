/**
 * Java-specific Handlebars helpers.
 */

import type { TypeRef, Parameter } from '../../ir/types.js';
import { camelCase } from '../shared/case-utils.js';

export function typeRefToJava(type: TypeRef): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToJava(type.type, type.format);
    case 'model':
      return type.name;
    case 'array':
      return `List<${typeRefToJava(type.items)}>`;
    case 'enum':
      return type.name;
    case 'union':
      return 'Object'; // Java doesn't have union types
    case 'map':
      return `Map<String, ${typeRefToJava(type.valueType)}>`;
    case 'void':
      return 'void';
    default:
      return 'Object';
  }
}

function primitiveToJava(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time') return 'OffsetDateTime';
      return 'String';
    case 'integer':
      if (format === 'int64') return 'Long';
      return 'Integer';
    case 'number':
      if (format === 'float') return 'Float';
      return 'Double';
    case 'boolean':
      return 'Boolean';
    default:
      return 'Object';
  }
}

export function typeRefToBoxed(type: TypeRef): string {
  const javaType = typeRefToJava(type);
  switch (javaType) {
    case 'int': return 'Integer';
    case 'long': return 'Long';
    case 'double': return 'Double';
    case 'float': return 'Float';
    case 'boolean': return 'Boolean';
    default: return javaType;
  }
}

export function javaDoc(text: string | undefined, indent: number = 0): string {
  if (!text) return '';
  const pad = ' '.repeat(indent);
  const lines = text.split('\n');
  return [
    `${pad}/**`,
    ...lines.map(line => `${pad} * ${line}`),
    `${pad} */`,
  ].join('\n');
}

/**
 * Check if a TypeRef resolves to a Java String type.
 */
export function isStringType(type: TypeRef): boolean {
  return type.kind === 'primitive' && type.type === 'string' && type.format !== 'binary';
}

export function registerJavaHelpers(handlebars: typeof import('handlebars')): void {
  handlebars.registerHelper('javaType', (type: TypeRef) => typeRefToJava(type));
  handlebars.registerHelper('javaBoxedType', (type: TypeRef) => typeRefToBoxed(type));
  handlebars.registerHelper('isStringType', (type: TypeRef) => isStringType(type));
  handlebars.registerHelper('javaDoc', (text: string, indent: number) =>
    javaDoc(text, typeof indent === 'number' ? indent : 0)
  );
  handlebars.registerHelper('javaMethodParams', function (this: any, method: any) {
    const parts: string[] = [];
    for (const param of method.pathParams ?? []) {
      parts.push(`${typeRefToJava(param.type)} ${camelCase(param.name)}`);
    }
    if (method.requestBody) {
      parts.push(`${typeRefToJava(method.requestBody.type)} body`);
    }
    return parts.join(', ');
  });
  // Returns a class literal safe for use with generics (strips type params)
  handlebars.registerHelper('javaClassLiteral', (type: TypeRef) => {
    switch (type.kind) {
      case 'model': return `${type.name}.class`;
      case 'array': return 'List.class';
      case 'map': return 'Map.class';
      case 'enum': return `${type.name}.class`;
      case 'void': return 'Void.class';
      case 'primitive': return `${primitiveToJava(type.type, type.format)}.class`;
      default: return 'Object.class';
    }
  });
  handlebars.registerHelper('javaTestValue', (param: any) => {
    if (param.type?.kind === 'enum') {
      return `${param.type.name}.values()[0]`;
    }
    return '"test-id"';
  });
  handlebars.registerHelper('javaReturnType', (method: any) => {
    if (method.paginated && method.paginationConfig) {
      return `Iterator<${typeRefToJava(method.paginationConfig.itemType)}>`;
    }
    if (method.response.type.kind === 'void') return 'void';
    return typeRefToJava(method.response.type);
  });
  // Convert dot-separated resource path to Java accessor chain
  // E.g., "courses.contents.children" -> "courses().contents().children()"
  handlebars.registerHelper('javaResourceChain', (path: string) => {
    if (!path) return '';
    return path.split('.').map(s => camelCase(s) + '()').join('.');
  });
  // Convert a path param to its string value, using getValue() for enums
  handlebars.registerHelper('javaParamToString', (param: any) => {
    const varName = camelCase(param.name);
    if (param.type?.kind === 'enum') {
      return `${varName}.getValue()`;
    }
    return `String.valueOf(${varName})`;
  });
}
