declare module 'swagger2openapi' {
  interface ConvertOptions {
    patch?: boolean;
    warnOnly?: boolean;
    resolve?: boolean;
    fatal?: boolean;
    [key: string]: any;
  }

  interface ConvertResult {
    openapi: object;
  }

  function convertObj(
    swagger: object,
    options?: ConvertOptions
  ): Promise<ConvertResult>;

  export default { convertObj };
}
