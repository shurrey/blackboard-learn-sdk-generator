export type {
  SDKIR, SDKMetadata, Resource, Method, MethodKind,
  Parameter, RequestBody, MethodResponse,
  Model, ModelProperty, ModelUsage,
  TypeRef, PrimitiveType, ModelRef, ArrayType, EnumType, UnionType, MapType, VoidType,
  EnumDef, EnumValue,
  AuthConfig, PaginationConfig, ErrorConfig, IdFormatConfig,
  MethodPaginationConfig,
} from './types.js';

export { IRBuilder, type BuilderConfig } from './builder.js';
export { buildResourceTree, resourceNodeToIR } from './resource-tree.js';
export { ModelResolver } from './model-resolver.js';
export { detectPagination } from './pagination-detector.js';
export { classifyMethod, disambiguateMethodName } from './method-classifier.js';
