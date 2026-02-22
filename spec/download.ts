import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_SPEC_URL = 'https://developer.blackboard.com/portal/docs/apis/learn-swagger.json';
const CACHE_DIR = join(import.meta.dirname, 'cache');

export interface DownloadOptions {
  specUrl?: string;
  forceDownload?: boolean;
  verbose?: boolean;
}

function getCachePath(url: string): string {
  const filename = url.split('/').pop() ?? 'learn-swagger.json';
  return join(CACHE_DIR, filename);
}

function getCacheMetaPath(cachePath: string): string {
  return cachePath + '.meta.json';
}

export async function downloadSpec(options: DownloadOptions = {}): Promise<object> {
  const url = options.specUrl ?? DEFAULT_SPEC_URL;
  const cachePath = getCachePath(url);
  const metaPath = getCacheMetaPath(cachePath);

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Check cache unless forced
  if (!options.forceDownload && existsSync(cachePath) && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (options.verbose) {
      console.log(`Using cached spec from ${meta.downloadedAt} (${cachePath})`);
    }
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  if (options.verbose) {
    console.log(`Downloading spec from ${url}...`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download spec: ${response.status} ${response.statusText}`);
  }

  const spec = await response.json();

  // Cache the downloaded spec
  writeFileSync(cachePath, JSON.stringify(spec, null, 2));
  writeFileSync(metaPath, JSON.stringify({
    url,
    downloadedAt: new Date().toISOString(),
    size: JSON.stringify(spec).length,
  }, null, 2));

  if (options.verbose) {
    console.log(`Spec downloaded and cached at ${cachePath}`);
  }

  return spec as object;
}

export async function loadSpecFromFile(filePath: string): Promise<object> {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}
