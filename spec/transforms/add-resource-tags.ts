/**
 * Normalize tags so every operation maps to a hierarchical resource path.
 * Tags are used during IR building to construct the resource tree.
 *
 * Input path:  /learn/api/public/v1/courses/{courseId}/contents/{contentId}
 * Output tag:  courses.contents
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function pathToResourceTag(path: string): string {
  // Strip API prefix and version
  let cleaned = path
    .replace(/^\/learn\/api\/public\/v\d+\//, '')
    .replace(/^\//, '');

  const segments = cleaned.split('/');

  // Build resource chain from non-parameter segments
  const resourceParts: string[] = [];
  for (const segment of segments) {
    if (!segment.startsWith('{')) {
      resourceParts.push(segment);
    }
  }

  return resourceParts.join('.');
}

function extractVersion(path: string): string | null {
  const match = path.match(/\/v(\d+)\//);
  return match ? `v${match[1]}` : null;
}

export function addResourceTags(spec: any): any {
  if (!spec.paths) return spec;

  const tagSet = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths) as [string, any][]) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const resourceTag = pathToResourceTag(path);
      const version = extractVersion(path);

      // Store as extension for IR builder
      operation['x-resource-tag'] = resourceTag;
      if (version) {
        operation['x-api-version'] = version;
      }

      // Also set the operation's tags array
      operation.tags = [resourceTag];
      tagSet.add(resourceTag);
    }
  }

  // Update the spec's tag definitions
  spec.tags = Array.from(tagSet).sort().map(name => ({
    name,
    description: `Operations for ${name.replace(/\./g, ' → ')}`,
  }));

  return spec;
}
