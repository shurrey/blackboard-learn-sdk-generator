/**
 * Builds a hierarchical resource tree from flat OpenAPI paths.
 *
 * Algorithm:
 * 1. Strip /learn/api/public/ prefix
 * 2. Extract version segment (v1, v2, v3)
 * 3. Split by /, ignore {param} segments
 * 4. Build tree: non-param segments = resource nodes
 * 5. Prefer latest version when multiple exist
 */

import type { Resource, Method } from './types.js';

interface ResourceNode {
  name: string;
  path: string;
  methods: Map<string, Method>;
  children: Map<string, ResourceNode>;
  apiVersion?: string;
}

/**
 * Parse an API path into resource segments and parameter segments.
 */
function parsePath(apiPath: string): { resourceSegments: string[]; version: string | null } {
  const versionMatch = apiPath.match(/\/v(\d+)\//);
  const version = versionMatch ? `v${versionMatch[1]}` : null;

  const cleaned = apiPath
    .replace(/^\/learn\/api\/public\/v\d+\//, '')
    .replace(/^\//, '');

  const segments = cleaned.split('/');
  const resourceSegments: string[] = [];

  for (const segment of segments) {
    if (!segment.startsWith('{')) {
      resourceSegments.push(segment);
    }
  }

  return { resourceSegments, version };
}

/**
 * Build a mutable tree of resource nodes.
 */
function ensureNode(root: ResourceNode, segments: string[]): ResourceNode {
  let current = root;
  const pathParts: string[] = [];

  for (const segment of segments) {
    pathParts.push(segment);
    if (!current.children.has(segment)) {
      current.children.set(segment, {
        name: segment,
        path: pathParts.join('.'),
        methods: new Map(),
        children: new Map(),
      });
    }
    current = current.children.get(segment)!;
  }

  return current;
}

/**
 * Build the resource tree from the OpenAPI spec.
 * Returns the root-level resources.
 */
export function buildResourceTree(spec: any): ResourceNode {
  const root: ResourceNode = {
    name: '_root',
    path: '',
    methods: new Map(),
    children: new Map(),
  };

  if (!spec.paths) return root;

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

  // Group operations by version and resource path
  const versionMap = new Map<string, Map<string, any[]>>();

  for (const [apiPath, pathItem] of Object.entries(spec.paths) as [string, any][]) {
    const { resourceSegments, version } = parsePath(apiPath);

    if (resourceSegments.length === 0) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const resourceTag = operation['x-resource-tag'] ?? resourceSegments.join('.');
      const ver = version ?? 'v1';

      if (!versionMap.has(resourceTag)) {
        versionMap.set(resourceTag, new Map());
      }
      const verOps = versionMap.get(resourceTag)!;
      if (!verOps.has(ver)) {
        verOps.set(ver, []);
      }
      verOps.get(ver)!.push({ path: apiPath, method, operation, resourceSegments });
    }
  }

  // For each resource, use the latest version
  for (const [resourceTag, versions] of versionMap) {
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => {
      const aNum = parseInt(a.replace('v', ''));
      const bNum = parseInt(b.replace('v', ''));
      return bNum - aNum; // Latest first
    });

    const latestVersion = sortedVersions[0];
    const operations = versions.get(latestVersion)!;

    for (const op of operations) {
      const node = ensureNode(root, op.resourceSegments);
      node.apiVersion = latestVersion;

      // Store operation info on the node
      const key = `${op.method}:${op.path}`;
      node.methods.set(key, {
        operationId: op.operation.operationId,
        httpMethod: op.method.toUpperCase(),
        path: op.path,
        operation: op.operation,
      } as any);
    }
  }

  return root;
}

/**
 * Convert a ResourceNode tree to the IR Resource format.
 */
export function resourceNodeToIR(node: ResourceNode): Resource[] {
  const resources: Resource[] = [];

  for (const [_name, child] of node.children) {
    const resource: Resource = {
      name: child.name,
      path: child.path,
      methods: [], // Will be populated by builder
      subresources: resourceNodeToIR(child),
      apiVersion: child.apiVersion,
    };
    resources.push(resource);
  }

  return resources;
}

export { ResourceNode };
