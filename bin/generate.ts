#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import { runSpecPipeline } from '../spec/index.js';
import { IRBuilder } from '../ir/builder.js';
import type { SDKIR } from '../ir/types.js';

const VALID_TARGETS = ['all', 'python', 'typescript', 'java', 'csharp', 'go', 'ruby', 'mcp'] as const;
type Target = typeof VALID_TARGETS[number];

interface GenerateOptions {
  spec?: string;
  config?: string;
  output?: string;
  skipDownload?: boolean;
  skipFormat?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

const program = new Command();

program
  .name('generate')
  .description('Generate Blackboard Learn SDKs from the REST API spec')
  .version('1.0.0')
  .argument('<target>', `Target to generate: ${VALID_TARGETS.join(' | ')}`)
  .option('--spec <url>', 'Override spec URL (or path to local file)')
  .option('--config <path>', 'Override config file path', './generator.config.yaml')
  .option('--output <dir>', 'Override output directory', './output')
  .option('--skip-download', 'Use cached spec')
  .option('--skip-format', 'Skip post-generation formatting')
  .option('--dry-run', 'Preview without writing files')
  .option('--verbose', 'Enable verbose logging')
  .action(async (target: string, options: GenerateOptions) => {
    if (!VALID_TARGETS.includes(target as Target)) {
      console.error(`Invalid target: ${target}. Must be one of: ${VALID_TARGETS.join(', ')}`);
      process.exit(1);
    }

    try {
      await generate(target as Target, options);
    } catch (err: any) {
      console.error(`Generation failed: ${err.message}`);
      if (options.verbose) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

program.parse();

async function generate(target: Target, options: GenerateOptions): Promise<void> {
  const startTime = Date.now();

  // Load config
  const configPath = resolve(options.config ?? './generator.config.yaml');
  if (options.verbose) console.log(`Loading config from ${configPath}`);

  let config: any;
  try {
    const configContent = readFileSync(configPath, 'utf-8');
    config = yaml.load(configContent);
  } catch (err: any) {
    throw new Error(`Failed to load config: ${err.message}`);
  }

  // Determine if spec is a URL or file path
  const specInput = options.spec ?? config.api?.specUrl;
  const isLocalFile = specInput && !specInput.startsWith('http');

  // Run spec pipeline
  console.log('Running spec pipeline...');
  const spec = await runSpecPipeline({
    specUrl: isLocalFile ? undefined : specInput,
    specFile: isLocalFile ? resolve(specInput) : undefined,
    forceDownload: !options.skipDownload,
    verbose: options.verbose,
  });

  // Build IR
  console.log('Building intermediate representation...');
  const builder = new IRBuilder(spec, {
    name: config.sdk?.name ?? 'blackboard-learn',
    version: config.sdk?.version ?? '1.0.0',
    license: config.sdk?.license ?? 'Apache-2.0',
    baseUrl: config.api?.baseUrl ?? 'https://{domain}/learn/api/public',
  });
  const ir = builder.build();

  console.log(`IR built: ${ir.resources.length} resources, ${ir.models.length} models, ${ir.enums.length} enums`);

  // Determine which targets to generate
  const targets: Target[] = target === 'all'
    ? ['python', 'typescript', 'java', 'csharp', 'go', 'ruby', 'mcp']
    : [target];

  const outputDir = resolve(options.output ?? './output');

  // Generate each target
  for (const t of targets) {
    console.log(`\nGenerating ${t}...`);
    await generateTarget(t, ir, config, outputDir, options);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

async function generateTarget(
  target: Target,
  ir: SDKIR,
  config: any,
  outputDir: string,
  options: GenerateOptions
): Promise<void> {
  const targetOutputDir = join(outputDir, getOutputDirName(target, config));

  if (options.dryRun) {
    console.log(`  [dry-run] Would generate ${target} to ${targetOutputDir}`);
    return;
  }

  // Dynamically import the emitter for the target
  try {
    const emitterModule = await import(`../emitters/${target}/emitter.js`);
    const EmitterClass = emitterModule.default ?? emitterModule[Object.keys(emitterModule)[0]];

    if (!EmitterClass) {
      console.log(`  Emitter for ${target} not yet implemented — skipping`);
      return;
    }

    const langConfig = target === 'mcp' ? config.mcp : config.languages?.[target];
    const emitter = new EmitterClass(ir, langConfig ?? {}, {
      outputDir: targetOutputDir,
      skipFormat: options.skipFormat ?? false,
      verbose: options.verbose ?? false,
    });

    await emitter.emit();
    console.log(`  Generated ${target} to ${targetOutputDir}`);
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      console.log(`  Emitter for ${target} not yet implemented — skipping`);
    } else {
      throw err;
    }
  }
}

function getOutputDirName(target: Target, config: any): string {
  switch (target) {
    case 'python': return `blackboard-learn-python`;
    case 'typescript': return `blackboard-learn-typescript`;
    case 'java': return `blackboard-learn-java`;
    case 'csharp': return `blackboard-learn-csharp`;
    case 'go': return `blackboard-learn-go`;
    case 'ruby': return `blackboard-learn-ruby`;
    case 'mcp': return `blackboard-learn-mcp`;
    default: return `blackboard-learn-${target}`;
  }
}
