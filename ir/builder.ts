/**
 * Builds the complete SDKIR from a transformed OpenAPI 3.0 spec.
 */

import { readFileSync } from 'node:fs';
import type {
  SDKIR, Resource, Method, Parameter, RequestBody,
  MethodResponse, TypeRef, AuthConfig, PaginationConfig,
  ErrorConfig, IdFormatConfig,
} from './types.js';
import { buildResourceTree, resourceNodeToIR, type ResourceNode } from './resource-tree.js';
import { ModelResolver } from './model-resolver.js';
import { detectPagination } from './pagination-detector.js';
import { classifyMethod, disambiguateMethodName } from './method-classifier.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

export interface BuilderConfig {
  name: string;
  version: string;
  license: string;
  baseUrl: string;
  idFormats?: string[];
}

const DEFAULT_CONFIG: BuilderConfig = {
  name: 'blackboard-lms',
  version: '1.0.0',
  license: 'Apache-2.0',
  baseUrl: 'https://{domain}/learn/api/public',
  idFormats: ['primary ID', 'externalId:{id}', 'userName:{name}', 'uuid:{uuid}'],
};

export class IRBuilder {
  private spec: any;
  private config: BuilderConfig;
  private resolver: ModelResolver;

  constructor(spec: any, config: Partial<BuilderConfig> = {}) {
    this.spec = spec;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.resolver = new ModelResolver(spec);
  }

  /**
   * Build the complete IR from the spec.
   */
  build(): SDKIR {
    // 1. Resolve all models and enums from schemas
    const { models } = this.resolver.resolveAll();

    // 2. Build resource tree (may register additional inline enums from path parameters)
    const rootNode = buildResourceTree(this.spec);
    const resources = this.buildResources(rootNode);

    // 3. Collect all enums (including any added during resource building)
    const enums = this.resolver.getEnums();

    // 4. Build metadata
    const metadata = {
      name: this.config.name,
      version: this.config.version,
      license: this.config.license,
      baseUrl: this.config.baseUrl,
      specVersion: this.spec.info?.version ?? 'unknown',
      generatorVersion: pkg.version,
      generatedAt: new Date().toISOString(),
      pathCount: Object.keys(this.spec.paths ?? {}).length,
      modelCount: models.length,
    };

    return {
      metadata,
      auth: this.buildAuthConfig(),
      pagination: this.buildPaginationConfig(),
      resources,
      models,
      enums,
      errors: this.buildErrorConfig(),
      idFormats: this.buildIdFormatConfig(),
    };
  }

  /**
   * Build resources with methods from the resource tree.
   */
  private buildResources(rootNode: ResourceNode): Resource[] {
    return this.buildResourcesFromNode(rootNode);
  }

  private buildResourcesFromNode(node: ResourceNode): Resource[] {
    const resources: Resource[] = [];

    for (const [_name, childNode] of node.children) {
      const methods = this.buildMethods(childNode);
      const subresources = this.buildResourcesFromNode(childNode);

      resources.push({
        name: childNode.name,
        path: childNode.path,
        methods,
        subresources,
        apiVersion: childNode.apiVersion,
      });
    }

    return resources;
  }

  /**
   * Build Method IR objects from a resource node's operations.
   */
  private buildMethods(node: ResourceNode): Method[] {
    const methods: Method[] = [];
    const usedNames = new Set<string>();

    for (const [_key, rawMethod] of node.methods) {
      const raw = rawMethod as any;
      const operation = raw.operation;
      const httpMethod = raw.httpMethod;
      const path = raw.path;

      // Classify the method
      const classification = classifyMethod({ httpMethod, path, operationId: operation.operationId });
      const methodName = disambiguateMethodName(classification.name, path, usedNames);
      usedNames.add(methodName);

      // Build parameters — dereference $ref pointers before filtering by location
      const resolvedParams = (operation.parameters ?? []).map((p: any) => this.derefParam(p));
      // Deduplicate by name+location (path-level and operation-level params may overlap)
      const seen = new Set<string>();
      const dedupedParams = resolvedParams.filter((p: any) => {
        const key = `${p.name}:${p.in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const pathParams = this.buildParameters(dedupedParams.filter((p: any) => p.in === 'path'));
      const queryParams = this.buildParameters(dedupedParams.filter((p: any) => p.in === 'query'));

      // Build request body — dereference $ref if needed
      let requestBody = this.buildRequestBody(this.derefParam(operation.requestBody));

      // Detect multipart file uploads from description when requestBody is missing
      // (some Swagger 2.0 specs describe uploads in prose without formal parameters)
      if (!requestBody && httpMethod === 'POST') {
        const desc = (operation.description ?? '').toLowerCase();
        if (desc.includes('multipart/form-data') || desc.includes('rfc 1867') || desc.includes('upload a file')) {
          requestBody = {
            contentType: 'multipart/form-data',
            required: true,
            type: { kind: 'primitive', type: 'string', format: 'binary' },
            description: 'File to upload',
            binary: true,
          };
        }
      }

      // Build response — dereference $ref in individual response entries
      const response = this.buildResponse(this.derefResponses(operation.responses));

      // Detect pagination
      const { paginated, config: paginationConfig } = detectPagination(operation, this.spec, this.resolver);

      methods.push({
        name: methodName,
        kind: classification.kind,
        operationId: operation.operationId ?? `${node.name}_${methodName}`,
        httpMethod: httpMethod as Method['httpMethod'],
        path,
        description: operation.summary ?? operation.description,
        pathParams,
        queryParams,
        requestBody: requestBody ?? undefined,
        response,
        paginated,
        paginationConfig,
        apiVersion: node.apiVersion,
        deprecated: operation.deprecated ?? false,
      });
    }

    return methods;
  }

  /**
   * Build Parameter IR objects from OpenAPI parameters.
   */
  private buildParameters(params: any[]): Parameter[] {
    return params.map(p => ({
      name: p.name,
      canonicalName: this.toCamelCase(p.name),
      description: p.description,
      required: p.required ?? false,
      type: this.resolver.schemaToTypeRef(p.schema ?? { type: 'string' }, p.name),
      defaultValue: p.schema?.default,
      enumValues: p.schema?.enum,
      location: p.in as Parameter['location'],
    }));
  }

  /**
   * Build RequestBody IR object.
   */
  private buildRequestBody(body: any): RequestBody | null {
    if (!body) return null;

    const content = body.content;
    if (!content) return null;

    // Prefer JSON
    const jsonContent = content['application/json'];
    if (jsonContent?.schema) {
      return {
        contentType: 'application/json',
        required: body.required ?? false,
        type: this.resolver.schemaToTypeRef(jsonContent.schema),
        description: body.description,
      };
    }

    // Fallback to form data (multipart is binary upload)
    const multipartContent = content['multipart/form-data'];
    if (multipartContent?.schema) {
      return {
        contentType: 'multipart/form-data',
        required: body.required ?? false,
        type: this.resolver.schemaToTypeRef(multipartContent.schema),
        description: body.description,
        binary: true,
      };
    }

    const formContent = content['application/x-www-form-urlencoded'];
    if (formContent?.schema) {
      return {
        contentType: 'application/x-www-form-urlencoded',
        required: body.required ?? false,
        type: this.resolver.schemaToTypeRef(formContent.schema),
        description: body.description,
      };
    }

    return null;
  }

  /**
   * Build MethodResponse IR object from operation responses.
   */
  private buildResponse(responses: any): MethodResponse {
    if (!responses) {
      return { statusCode: 200, type: { kind: 'void' } };
    }

    // Find the success response (2xx or 3xx redirect for downloads)
    for (const code of ['200', '201', '202', '204', '302']) {
      const response = responses[code];
      if (!response) continue;

      // Check for binary download (application/octet-stream)
      const binaryContent = response.content?.['application/octet-stream'];
      if (binaryContent) {
        return {
          statusCode: parseInt(code),
          contentType: 'application/octet-stream',
          type: { kind: 'primitive', type: 'string', format: 'binary' },
          description: response.description,
          binary: true,
        };
      }

      // Check for redirect-based downloads (302 with Location header, no content body)
      if (code === '302' && response.headers?.Location) {
        return {
          statusCode: 302,
          contentType: 'application/octet-stream',
          type: { kind: 'primitive', type: 'string', format: 'binary' },
          description: response.description,
          binary: true,
        };
      }

      const content = response.content?.['application/json'];
      if (!content?.schema) {
        return {
          statusCode: parseInt(code),
          type: { kind: 'void' },
          description: response.description,
        };
      }

      return {
        statusCode: parseInt(code),
        contentType: 'application/json',
        type: this.resolver.schemaToTypeRef(content.schema),
        description: response.description,
      };
    }

    return { statusCode: 200, type: { kind: 'void' } };
  }

  private buildAuthConfig(): AuthConfig {
    return {
      twoLegged: {
        tokenEndpoint: '/learn/api/public/v1/oauth2/token',
        grantType: 'client_credentials',
      },
      threeLegged: {
        authorizeEndpoint: '/learn/api/public/v1/oauth2/authorizationcode',
        tokenEndpoint: '/learn/api/public/v1/oauth2/token',
        grantType: 'authorization_code',
        pkce: true,
      },
    };
  }

  private buildPaginationConfig(): PaginationConfig {
    return {
      style: 'offset',
      offsetParam: 'offset',
      limitParam: 'limit',
      defaultLimit: 100,
      resultsField: 'results',
      pagingField: 'paging',
      nextPageField: 'paging.nextPage',
    };
  }

  private buildErrorConfig(): ErrorConfig {
    return {
      baseModel: 'RestException',
      statusMap: {
        400: 'BadRequestError',
        401: 'AuthenticationError',
        403: 'PermissionError',
        404: 'NotFoundError',
        409: 'ConflictError',
        429: 'RateLimitError',
        500: 'InternalServerError',
        502: 'BadGatewayError',
        503: 'ServiceUnavailableError',
        504: 'GatewayTimeoutError',
      },
    };
  }

  private buildIdFormatConfig(): IdFormatConfig {
    return {
      formats: this.config.idFormats ?? DEFAULT_CONFIG.idFormats!,
      description: 'Blackboard LMS supports multiple ID formats. Primary keys are numeric. ' +
        'Alternative lookups use prefixed formats: externalId:{id}, userName:{name}, uuid:{uuid}.',
    };
  }

  /**
   * Dereference a $ref pointer (parameters, requestBodies, etc.).
   * Returns the resolved object, or the original if not a $ref.
   */
  private derefParam(obj: any): any {
    if (!obj?.$ref) return obj ?? {};

    const refPath = obj.$ref.replace('#/', '').split('/');
    let current = this.spec;
    for (const segment of refPath) {
      current = current?.[segment];
    }
    return current ?? obj;
  }

  /**
   * Dereference any $ref entries within a responses object.
   */
  private derefResponses(responses: any): any {
    if (!responses) return responses;
    const result: any = {};
    for (const [code, response] of Object.entries(responses)) {
      result[code] = this.derefParam(response);
    }
    return result;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[_\-\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  }
}
