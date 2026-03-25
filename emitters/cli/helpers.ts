/**
 * CLI-specific Handlebars helpers.
 */

import type { TypeRef, Method, Parameter, Resource } from '../../ir/types.js';
import { camelCase, pascalCase, snakeCase } from '../shared/case-utils.js';
import { typeRefToGo } from '../go/helpers.js';

/**
 * Convert a string to kebab-case (for CLI flag names).
 */
export function kebabCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\.\s]+/g, '-')
    .toLowerCase();
}

/**
 * Build the Cobra `Use` string for a method.
 * E.g., "get [courseId]" or "list"
 */
export function cobraUse(method: Method): string {
  const parts = [kebabCase(method.name)];
  for (const param of method.pathParams) {
    parts.push(`[${param.name}]`);
  }
  return parts.join(' ');
}

/**
 * Build the cobra.Args validator for a method.
 */
export function cobraArgs(method: Method): string {
  const count = method.pathParams.length;
  if (count === 0) return 'cobra.NoArgs';
  if (count === 1) return 'cobra.ExactArgs(1)';
  return `cobra.ExactArgs(${count})`;
}

/**
 * Build the variable name for a resource's Cobra command.
 * E.g., "courses" -> "coursesCmd", "courses.contents" -> "coursesContentsCmd"
 */
export function commandVarName(resource: Resource): string {
  const path = resource.path ?? resource.name;
  const parts = path.split('.').map(p => pascalCase(p));
  return camelCase(parts.join('')) + 'Cmd';
}

/**
 * Build the variable name for a method's Cobra command.
 * E.g., resource "courses", method "list" -> "coursesListCmd"
 */
export function methodCmdVarName(resource: Resource, method: Method): string {
  const parts = resource.path.split('.').map(p => pascalCase(p));
  return camelCase(parts.join('') + pascalCase(method.name)) + 'Cmd';
}

/**
 * Build the SDK client accessor chain for a resource.
 * E.g., "courses.contents" -> "client.Courses.Contents"
 */
export function sdkAccessor(resource: Resource): string {
  const path = resource.path ?? resource.name;
  const parts = path.split('.').map(p => pascalCase(p));
  return 'client.' + parts.join('.');
}

/**
 * Get the Go type string for a flag's type (for Cobra flag registration).
 */
export function cobraFlagType(param: Parameter): 'String' | 'Int' | 'Bool' | 'Float64' {
  if (param.type.kind === 'primitive') {
    switch (param.type.type) {
      case 'integer': return 'Int';
      case 'boolean': return 'Bool';
      case 'number': return 'Float64';
      default: return 'String';
    }
  }
  return 'String';
}

/**
 * Get the Go zero value for a flag type.
 */
export function cobraFlagDefault(param: Parameter): string {
  if (param.defaultValue !== undefined) {
    if (typeof param.defaultValue === 'string') return `"${param.defaultValue}"`;
    return String(param.defaultValue);
  }
  if (param.type.kind === 'primitive') {
    switch (param.type.type) {
      case 'integer': return '0';
      case 'boolean': return 'false';
      case 'number': return '0.0';
      default: return '""';
    }
  }
  return '""';
}

/**
 * Output a literal Go template expression like {{ .Version }}.
 * Handlebars would interpret {{ }} as its own syntax, so we use a helper.
 */
function goTmpl(expr: string): string {
  return `{{ ${expr} }}`;
}

export function registerCLIHelpers(handlebars: typeof import('handlebars')): void {
  // Output literal Go/goreleaser template expressions: {{ .Version }}
  handlebars.registerHelper('goTmpl', (expr: string) => goTmpl(expr));
  // Output literal GitHub Actions expressions: ${{ secrets.TOKEN }}
  handlebars.registerHelper('ghExpr', (expr: string) => `\${{ ${expr} }}`);
  handlebars.registerHelper('kebabCase', (s: string) => kebabCase(s));
  handlebars.registerHelper('cobraUse', (method: Method) => cobraUse(method));
  handlebars.registerHelper('cobraArgs', (method: Method) => cobraArgs(method));
  handlebars.registerHelper('commandVarName', (resource: Resource) => commandVarName(resource));
  handlebars.registerHelper('methodCmdVarName', (resource: Resource, method: Method) => {
    return methodCmdVarName(resource, method);
  });
  handlebars.registerHelper('sdkAccessor', (resource: Resource) => sdkAccessor(resource));
  handlebars.registerHelper('cobraFlagType', (param: Parameter) => cobraFlagType(param));
  handlebars.registerHelper('cobraFlagDefault', (param: Parameter) => cobraFlagDefault(param));

  // Go type helper for CLI — prefixes SDK model/enum types with "lms."
  handlebars.registerHelper('goType', (type: TypeRef) => {
    const goType = typeRefToGo(type);
    // Prefix model and enum types with the lms package qualifier
    if (type.kind === 'model' || type.kind === 'enum') {
      return `lms.${goType}`;
    }
    if (type.kind === 'array' && (type.items.kind === 'model' || type.items.kind === 'enum')) {
      return `[]lms.${typeRefToGo(type.items)}`;
    }
    return goType;
  });

  // Short description for Cobra command (first sentence of description)
  handlebars.registerHelper('shortDesc', (desc: string) => {
    if (!desc) return '';
    const first = desc.split(/[.\n]/)[0].trim();
    return first.length > 80 ? first.slice(0, 77) + '...' : first;
  });

  // Build the arg-binding lines: courseId := args[0], etc.
  handlebars.registerHelper('argBindings', (method: Method) => {
    return method.pathParams
      .map((p, i) => {
        const varName = camelCase(p.name);
        if (p.type.kind === 'enum') {
          return `${varName} := lms.${p.type.name}(args[${i}])`;
        }
        return `${varName} := args[${i}]`;
      })
      .join('\n\t\t');
  });

  // Build the SDK method call arguments
  handlebars.registerHelper('sdkCallArgs', (method: Method) => {
    const parts = ['ctx'];
    for (const p of method.pathParams) {
      parts.push(camelCase(p.name));
    }
    if (method.requestBody) {
      parts.push('&body');
    }
    return parts.join(', ');
  });

  // Check if a method needs body input (create/update)
  handlebars.registerHelper('needsBody', function (this: any, method: Method, options: any) {
    return method.requestBody ? options.fn(this) : options.inverse(this);
  });

  // Check if resource is top-level
  handlebars.registerHelper('isTopLevel', (resource: Resource) => {
    return !resource.path || !resource.path.includes('.');
  });

  // Check if a resource has any non-upload methods that need a request body
  handlebars.registerHelper('hasBodyMethods', (resource: Resource) => {
    return resource.methods?.some((m: Method) => m.requestBody && !m.requestBody.binary);
  });

  // Non-block version of isUpload for use in subexpressions like {{#unless (isUploadMethod this)}}
  handlebars.registerHelper('isUploadMethod', (method: Method) => {
    return !!method.requestBody?.binary;
  });

  // Check if a resource has any download methods (need "os" import)
  handlebars.registerHelper('hasDownloadMethods', (resource: Resource) => {
    return resource.methods?.some((m: Method) => m.response?.binary);
  });

  // Check if resource needs os import (body methods or download methods)
  handlebars.registerHelper('needsOsImport', (resource: Resource) => {
    return resource.methods?.some((m: Method) =>
      (m.requestBody && !m.requestBody.binary) || m.response?.binary
    );
  });
}
