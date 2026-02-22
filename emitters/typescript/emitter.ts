/**
 * TypeScript SDK emitter.
 * Generates a complete TypeScript/JavaScript SDK from the IR.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerTSHelpers, typeRefToTS } from './helpers.js';
import type { SDKIR, Resource, Model, EnumDef, TypeRef } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class TypeScriptEmitter extends BaseEmitter {
  get language(): string {
    return 'typescript';
  }

  registerHelpers(): void {
    registerTSHelpers(this.handlebars);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    // Core files
    files.set('client', 'src/client.ts');
    files.set('http-client', 'src/http-client.ts');
    files.set('auth', 'src/auth.ts');
    files.set('pagination', 'src/pagination.ts');
    files.set('errors', 'src/errors.ts');
    files.set('index', 'src/index.ts');

    // Build config
    files.set('package-json', 'package.json');
    files.set('tsconfig', 'tsconfig.json');

    // Resource files — one per resource (flattened)
    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(`resource:${resource.name}`, `src/resources/${resource.name}.ts`);
    }

    // Test files — one per resource
    for (const resource of allResources) {
      files.set(`test:${resource.name}`, `tests/${resource.name}.test.ts`);
    }

    // Model files — one per model
    for (const model of this.ir.models) {
      files.set(`model:${model.originalName ?? model.name}`, `src/types/${model.originalName ?? model.name}.ts`);
    }

    // Enum files
    for (const enumDef of this.ir.enums) {
      files.set(`enum:${enumDef.name}`, `src/types/${enumDef.name}.ts`);
    }

    return files;
  }

  getTemplateContext(templateName: string): any {
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
    };

    // Handle test templates
    if (templateName.startsWith('test:')) {
      const resourceName = templateName.slice('test:'.length);
      const resource = this.findResource(resourceName);
      if (!resource) throw new Error(`Resource not found: ${resourceName}`);

      return {
        ...base,
        resource,
      };
    }

    // Handle resource templates
    if (templateName.startsWith('resource:')) {
      const resourceName = templateName.slice('resource:'.length);
      const resource = this.findResource(resourceName);
      if (!resource) throw new Error(`Resource not found: ${resourceName}`);

      return {
        ...base,
        resource,
        imports: this.getResourceImports(resource),
        subresourceImports: resource.subresources.map(sr => sr.name),
      };
    }

    // Handle model templates
    if (templateName.startsWith('model:')) {
      const modelName = templateName.slice('model:'.length);
      const model = this.ir.models.find(m => (m.originalName ?? m.name) === modelName);
      if (!model) throw new Error(`Model not found: ${modelName}`);

      return {
        ...base,
        model,
        importedTypes: this.getModelImports(model),
      };
    }

    // Handle enum templates
    if (templateName.startsWith('enum:')) {
      const enumName = templateName.slice('enum:'.length);
      const enumDef = this.ir.enums.find(e => e.name === enumName);
      if (!enumDef) throw new Error(`Enum not found: ${enumName}`);

      return {
        ...base,
        enumDef,
      };
    }

    // Core templates
    return {
      ...base,
      topLevelResources: this.ir.resources,
      models: this.ir.models,
      enums: this.ir.enums,
      errors: this.ir.errors,
    };
  }

  async postProcess(): Promise<void> {
    try {
      execSync('npx prettier --write "src/**/*.ts"', {
        cwd: this.options.outputDir,
        stdio: 'pipe',
      });
    } catch {
      // Prettier not available — skip
    }
  }

}

export default TypeScriptEmitter;
