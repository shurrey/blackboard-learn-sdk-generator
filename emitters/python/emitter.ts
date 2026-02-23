/**
 * Python SDK emitter.
 * Generates a complete Python SDK from the IR using httpx and Pydantic v2.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerPyHelpers, typeRefToPy } from './helpers.js';
import { snakeCase } from '../shared/case-utils.js';
import type { SDKIR, Resource, Model, EnumDef, TypeRef } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class PythonEmitter extends BaseEmitter {
  get language(): string {
    return 'python';
  }

  registerHelpers(): void {
    registerPyHelpers(this.handlebars);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    // Package root files
    files.set('pyproject-toml', 'pyproject.toml');

    // Core package files
    const pkg = 'src/blackboard_learn';
    files.set('init', `${pkg}/__init__.py`);
    files.set('client', `${pkg}/client.py`);
    files.set('http-client', `${pkg}/_http_client.py`);
    files.set('auth', `${pkg}/_auth.py`);
    files.set('pagination', `${pkg}/_pagination.py`);
    files.set('errors', `${pkg}/_errors.py`);

    // Resource files -- one per resource (flattened)
    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(
        `resource:${resource.name}`,
        `${pkg}/resources/${snakeCase(resource.name)}.py`,
      );
    }

    // Test files -- one per resource
    for (const resource of allResources) {
      files.set(
        `test:${resource.name}`,
        `tests/test_${snakeCase(resource.name)}.py`,
      );
    }

    // Resources __init__.py
    files.set('resources-init', `${pkg}/resources/__init__.py`);

    // Model files -- one per model
    for (const model of this.ir.models) {
      const fileName = snakeCase(model.originalName ?? model.name);
      files.set(
        `model:${model.originalName ?? model.name}`,
        `${pkg}/types/${fileName}.py`,
      );
    }

    // Enum files
    for (const enumDef of this.ir.enums) {
      files.set(
        `enum:${enumDef.name}`,
        `${pkg}/types/${snakeCase(enumDef.name)}.py`,
      );
    }

    // Types __init__.py
    files.set('types-init', `${pkg}/types/__init__.py`);

    // Documentation
    files.set('readme', 'README.md');
    files.set('authentication', 'docs/authentication.md');
    for (const resource of allResources) {
      files.set(`doc:${resource.name}`, `docs/${resource.name}.md`);
    }

    // Integration tests
    files.set('integration:all', 'tests/integration/test_integration.py');

    // Repo files
    files.set('contributing', 'CONTRIBUTING.md');
    files.set('ci-workflow', '.github/workflows/ci.yml');
    files.set('agent-md', 'AGENT.md');

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

    // resources-init and types-init templates
    if (templateName === 'resources-init') {
      return {
        ...base,
        allResources: this.flattenResources(),
      };
    }

    if (templateName === 'types-init') {
      return {
        ...base,
        models: this.ir.models,
        enums: this.ir.enums,
      };
    }

    // Integration test templates
    if (templateName.startsWith('integration:')) {
      return {
        ...base,
        resources: this.flattenResources().filter(r => r.methods.length > 0),
      };
    }

    // Doc templates
    if (templateName === 'readme') {
      return {
        ...base,
        topLevelResources: this.ir.resources,
      };
    }

    if (templateName.startsWith('doc:')) {
      const resourceName = templateName.slice('doc:'.length);
      const resource = this.findResource(resourceName);
      if (!resource) throw new Error(`Resource not found: ${resourceName}`);
      return {
        ...base,
        resource,
        idFormats: this.ir.idFormats,
      };
    }

    // Core templates
    return {
      ...base,
      topLevelResources: this.ir.resources,
      allResources: this.flattenResources(),
      models: this.ir.models,
      enums: this.ir.enums,
      errors: this.ir.errors,
    };
  }

  async postProcess(): Promise<void> {
    try {
      execSync('ruff format src/', {
        cwd: this.options.outputDir,
        stdio: 'pipe',
      });
    } catch {
      // ruff not available -- skip formatting
    }
  }

}

export default PythonEmitter;
