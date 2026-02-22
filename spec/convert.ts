import swagger2openapi from 'swagger2openapi';

export interface ConvertOptions {
  verbose?: boolean;
}

export async function convertToOpenAPI3(swaggerSpec: object, options: ConvertOptions = {}): Promise<object> {
  if (options.verbose) {
    console.log('Converting Swagger 2.0 to OpenAPI 3.0...');
  }

  const result = await swagger2openapi.convertObj(swaggerSpec, {
    patch: true,
    warnOnly: true,
    resolve: false,
    fatal: false,
  });

  if (options.verbose) {
    const pathCount = Object.keys((result.openapi as any)?.paths ?? {}).length;
    console.log(`Conversion complete. ${pathCount} paths found.`);
  }

  return result.openapi;
}
