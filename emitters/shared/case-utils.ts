/**
 * Shared case-conversion utilities.
 * Canonical implementations used by all emitters.
 */

/**
 * Convert a string to camelCase.
 * Handles underscores, hyphens, dots, and spaces as word separators.
 */
export function camelCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/[_\-\.\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

/**
 * Convert a string to PascalCase.
 * Handles underscores, hyphens, dots, and spaces as word separators.
 */
export function pascalCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/[_\-\.\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/**
 * Convert a string to snake_case.
 * Acronym-aware: HTTPClient → http_client (not h_t_t_p_client).
 * Handles underscores, hyphens, dots, and spaces as word separators.
 */
export function snakeCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\-\.\s]+/g, '_')
    .toLowerCase();
}
