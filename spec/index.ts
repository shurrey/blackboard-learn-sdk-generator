export { downloadSpec, loadSpecFromFile, type DownloadOptions } from './download.js';
export { convertToOpenAPI3, type ConvertOptions } from './convert.js';
export { applyTransforms, type TransformOptions } from './transforms/index.js';
export { validateSpec, type ValidateOptions, type ValidationResult } from './validate.js';
export { computeDiff, hasDiffChanges, formatDiffReport, formatDiffMarkdown, type DiffResult } from './diff.js';

export interface SpecPipelineOptions {
  specUrl?: string;
  specFile?: string;
  forceDownload?: boolean;
  verbose?: boolean;
}

/**
 * Run the complete spec pipeline:
 * 1. Download (or load from file/cache)
 * 2. Convert Swagger 2.0 → OpenAPI 3.0
 * 3. Apply transforms
 * 4. Validate
 */
export async function runSpecPipeline(options: SpecPipelineOptions = {}): Promise<any> {
  const { downloadSpec } = await import('./download.js');
  const { convertToOpenAPI3 } = await import('./convert.js');
  const { applyTransforms } = await import('./transforms/index.js');
  const { validateSpec } = await import('./validate.js');

  // Step 1: Download or load
  if (options.verbose) console.log('Step 1: Loading spec...');
  let spec: any;
  if (options.specFile) {
    const { loadSpecFromFile } = await import('./download.js');
    spec = await loadSpecFromFile(options.specFile);
  } else {
    spec = await downloadSpec({
      specUrl: options.specUrl,
      forceDownload: options.forceDownload,
      verbose: options.verbose,
    });
  }

  // Step 2: Convert to OpenAPI 3.0
  if (options.verbose) console.log('Step 2: Converting to OpenAPI 3.0...');
  const openapi = await convertToOpenAPI3(spec, { verbose: options.verbose });

  // Step 3: Apply transforms
  if (options.verbose) console.log('Step 3: Applying transforms...');
  const transformed = applyTransforms(openapi, { verbose: options.verbose });

  // Step 4: Validate
  if (options.verbose) console.log('Step 4: Validating...');
  const validation = await validateSpec(transformed, { verbose: options.verbose });

  if (!validation.valid) {
    console.warn('Spec validation produced errors:');
    for (const error of validation.errors) {
      console.warn(`  - ${error}`);
    }
    // Don't throw - some errors may be tolerable from the Blackboard spec
  }

  return transformed;
}
