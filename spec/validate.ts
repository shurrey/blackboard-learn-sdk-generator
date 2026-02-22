import SwaggerParser from '@apidevtools/swagger-parser';

export interface ValidateOptions {
  verbose?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  pathCount: number;
  schemaCount: number;
}

/**
 * Validate a transformed OpenAPI 3.0 spec.
 * Uses @apidevtools/swagger-parser for JSON Schema validation.
 */
export async function validateSpec(spec: any, options: ValidateOptions = {}): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // swagger-parser validates against the OpenAPI 3.0 JSON Schema
    await SwaggerParser.validate(structuredClone(spec));
  } catch (err: any) {
    if (err.details) {
      for (const detail of err.details) {
        errors.push(`${detail.path?.join('.') ?? 'unknown'}: ${detail.message}`);
      }
    } else {
      errors.push(err.message);
    }
  }

  // Additional custom validations
  const pathCount = Object.keys(spec.paths ?? {}).length;
  const schemaCount = Object.keys(spec.components?.schemas ?? {}).length;

  if (pathCount === 0) {
    errors.push('Spec contains no paths');
  }

  if (schemaCount === 0) {
    warnings.push('Spec contains no schemas');
  }

  // Validate all operations have operationIds
  if (spec.paths) {
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    for (const [path, pathItem] of Object.entries(spec.paths) as [string, any][]) {
      for (const method of methods) {
        const operation = pathItem[method];
        if (operation && !operation.operationId) {
          warnings.push(`Missing operationId: ${method.toUpperCase()} ${path}`);
        }
      }
    }
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
    pathCount,
    schemaCount,
  };

  if (options.verbose) {
    console.log(`Validation: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Paths: ${pathCount}, Schemas: ${schemaCount}`);
    if (errors.length > 0) console.log(`  Errors: ${errors.length}`);
    if (warnings.length > 0) console.log(`  Warnings: ${warnings.length}`);
  }

  return result;
}
