/**
 * Language-agnostic Intermediate Representation (IR) types.
 * The IR is the central contract between the spec pipeline and all emitters.
 */

// ─── Top-level IR ───────────────────────────────────────────────────────────────

export interface SDKIR {
  metadata: SDKMetadata;
  auth: AuthConfig;
  pagination: PaginationConfig;
  resources: Resource[];
  models: Model[];
  enums: EnumDef[];
  errors: ErrorConfig;
  idFormats: IdFormatConfig;
}

export interface SDKMetadata {
  name: string;
  version: string;
  license: string;
  baseUrl: string;
  specVersion: string;
  generatorVersion: string;
  generatedAt: string;
  pathCount: number;
  modelCount: number;
}

// ─── Auth ───────────────────────────────────────────────────────────────────────

export interface AuthConfig {
  twoLegged: {
    tokenEndpoint: string;
    grantType: 'client_credentials';
  };
  threeLegged: {
    authorizeEndpoint: string;
    tokenEndpoint: string;
    grantType: 'authorization_code';
    pkce: boolean;
  };
}

// ─── Pagination ─────────────────────────────────────────────────────────────────

export interface PaginationConfig {
  style: 'offset';
  offsetParam: string;
  limitParam: string;
  defaultLimit: number;
  resultsField: string;
  pagingField: string;
  nextPageField: string;
}

// ─── Resources ──────────────────────────────────────────────────────────────────

export interface Resource {
  /** Canonical name (lowercase, plural). E.g., "courses" */
  name: string;
  /** Display name override if different from canonical */
  displayName?: string;
  /** Dot-separated path from root. E.g., "courses.contents" */
  path: string;
  /** Description from spec */
  description?: string;
  /** Methods on this resource */
  methods: Method[];
  /** Nested sub-resources */
  subresources: Resource[];
  /** API version (v1, v2, v3) */
  apiVersion?: string;
  /** Whether this is deprecated (older version exists) */
  deprecated?: boolean;
}

// ─── Methods ────────────────────────────────────────────────────────────────────

export type MethodKind = 'list' | 'get' | 'create' | 'update' | 'replace' | 'delete' | 'action';

export interface Method {
  /** Canonical name: list, get, create, update, delete, or custom */
  name: string;
  /** Method kind for code generation */
  kind: MethodKind;
  /** Original operationId from spec */
  operationId: string;
  /** HTTP method */
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Full API path (with {param} placeholders) */
  path: string;
  /** Description */
  description?: string;
  /** Path parameters */
  pathParams: Parameter[];
  /** Query parameters */
  queryParams: Parameter[];
  /** Request body, if any */
  requestBody?: RequestBody;
  /** Successful response */
  response: MethodResponse;
  /** Whether this endpoint supports pagination */
  paginated: boolean;
  /** Pagination details if paginated */
  paginationConfig?: MethodPaginationConfig;
  /** API version */
  apiVersion?: string;
  /** Deprecated? */
  deprecated?: boolean;
}

export interface MethodPaginationConfig {
  resultsField: string;
  itemType: TypeRef;
}

// ─── Parameters ─────────────────────────────────────────────────────────────────

export interface Parameter {
  /** Parameter name as it appears in the API */
  name: string;
  /** Canonical name (camelCase) */
  canonicalName: string;
  /** Description */
  description?: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Type of the parameter */
  type: TypeRef;
  /** Default value, if any */
  defaultValue?: any;
  /** Enum values for string params */
  enumValues?: string[];
  /** Location: path, query, header */
  location: 'path' | 'query' | 'header';
}

// ─── Request/Response ───────────────────────────────────────────────────────────

export interface RequestBody {
  /** Content type */
  contentType: string;
  /** Whether the body is required */
  required: boolean;
  /** Type of the body */
  type: TypeRef;
  /** Description */
  description?: string;
  /** Whether this is a binary upload (multipart/form-data) */
  binary?: boolean;
}

export interface MethodResponse {
  /** HTTP status code for success */
  statusCode: number;
  /** Content type */
  contentType?: string;
  /** Type of the response body */
  type: TypeRef;
  /** Description */
  description?: string;
  /** Whether this is a binary download (application/octet-stream) */
  binary?: boolean;
}

// ─── Type System ────────────────────────────────────────────────────────────────

export type TypeRef =
  | PrimitiveType
  | ModelRef
  | ArrayType
  | EnumType
  | UnionType
  | MapType
  | VoidType;

export interface PrimitiveType {
  kind: 'primitive';
  type: 'string' | 'integer' | 'number' | 'boolean';
  format?: string; // e.g., 'date-time', 'int64', 'float', 'binary'
}

export interface ModelRef {
  kind: 'model';
  name: string;
}

export interface ArrayType {
  kind: 'array';
  items: TypeRef;
}

export interface EnumType {
  kind: 'enum';
  name: string;
  values: string[];
}

export interface UnionType {
  kind: 'union';
  types: TypeRef[];
}

export interface MapType {
  kind: 'map';
  valueType: TypeRef;
}

export interface VoidType {
  kind: 'void';
}

// ─── Models ─────────────────────────────────────────────────────────────────────

export interface Model {
  /** PascalCase model name. E.g., "Course" */
  name: string;
  /** Description from spec */
  description?: string;
  /** Properties */
  properties: ModelProperty[];
  /** Required property names */
  required: string[];
  /** Whether this is used as a request body (create/update params) */
  usage: ModelUsage;
  /** Original schema name from spec */
  originalName?: string;
}

export type ModelUsage = 'response' | 'create' | 'update' | 'both' | 'internal';

export interface ModelProperty {
  /** Property name as in JSON */
  name: string;
  /** Canonical name */
  canonicalName: string;
  /** Description */
  description?: string;
  /** Type */
  type: TypeRef;
  /** Whether this property is required */
  required: boolean;
  /** Whether this is read-only (response only) */
  readOnly?: boolean;
  /** Whether this is write-only (request only) */
  writeOnly?: boolean;
  /** Default value */
  defaultValue?: any;
  /** Deprecated */
  deprecated?: boolean;
}

// ─── Enums ──────────────────────────────────────────────────────────────────────

export interface EnumDef {
  /** PascalCase enum name */
  name: string;
  /** Description */
  description?: string;
  /** Enum values */
  values: EnumValue[];
}

export interface EnumValue {
  /** Original value from spec (e.g., "InProgress") */
  value: string;
  /** Description */
  description?: string;
}

// ─── Errors ─────────────────────────────────────────────────────────────────────

export interface ErrorConfig {
  /** Base error model */
  baseModel: string;
  /** Error subclasses mapping HTTP status to error class name */
  statusMap: Record<number, string>;
}

// ─── ID Formats ─────────────────────────────────────────────────────────────────

export interface IdFormatConfig {
  /** Supported ID format patterns */
  formats: string[];
  /** Description of how Blackboard IDs work */
  description: string;
}
