/**
 * Ruby SDK emitter.
 * Generates a complete Ruby SDK using Faraday and data classes.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerRubyHelpers } from './helpers.js';
import { snakeCase } from '../shared/case-utils.js';
import type { SDKIR, Resource } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class RubyEmitter extends BaseEmitter {
  private gemName: string;
  private moduleName: string;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.gemName = langConfig.gemName ?? 'blackboard_learn';
    this.moduleName = langConfig.moduleName ?? 'BlackboardLearn';
  }

  get language(): string {
    return 'ruby';
  }

  registerHelpers(): void {
    registerRubyHelpers(this.handlebars);
    this.handlebars.registerHelper('rubyModule', () => this.moduleName);
    this.handlebars.registerHelper('gemName', () => this.gemName);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    files.set('client', `lib/${this.gemName}/client.rb`);
    files.set('http-client', `lib/${this.gemName}/http_client.rb`);
    files.set('auth', `lib/${this.gemName}/auth.rb`);
    files.set('pagination', `lib/${this.gemName}/pagination.rb`);
    files.set('errors', `lib/${this.gemName}/errors.rb`);
    files.set('init', `lib/${this.gemName}.rb`);
    files.set('gemspec', `${this.gemName}.gemspec`);

    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(`resource:${resource.name}`, `lib/${this.gemName}/resources/${snakeCase(resource.name)}.rb`);
    }

    // Test files — one per resource
    for (const resource of allResources) {
      files.set(`test:${resource.name}`, `spec/resources/${snakeCase(resource.name)}_spec.rb`);
    }

    for (const model of this.ir.models) {
      files.set(`model:${model.originalName ?? model.name}`, `lib/${this.gemName}/types/${snakeCase(model.originalName ?? model.name)}.rb`);
    }

    // Documentation
    files.set('readme', 'README.md');
    files.set('authentication', 'docs/authentication.md');
    for (const resource of allResources) {
      files.set(`doc:${resource.name}`, `docs/${resource.name}.md`);
    }

    // Integration tests
    files.set('integration:all', 'spec/integration/integration_spec.rb');

    return files;
  }

  getTemplateContext(templateName: string): any {
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
      moduleName: this.moduleName,
      gemName: this.gemName,
    };

    if (templateName.startsWith('test:')) {
      const name = templateName.slice('test:'.length);
      const resource = this.flattenResources().find(r => r.name === name);
      return { ...base, resource };
    }

    if (templateName.startsWith('resource:')) {
      const name = templateName.slice('resource:'.length);
      const resource = this.flattenResources().find(r => r.name === name);
      return { ...base, resource };
    }
    if (templateName.startsWith('model:')) {
      const name = templateName.slice('model:'.length);
      const model = this.ir.models.find(m => (m.originalName ?? m.name) === name);
      return { ...base, model };
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
      const name = templateName.slice('doc:'.length);
      const resource = this.flattenResources().find(r => r.name === name);
      return {
        ...base,
        resource,
        idFormats: this.ir.idFormats,
      };
    }

    return {
      ...base,
      topLevelResources: this.ir.resources,
      models: this.ir.models,
      enums: this.ir.enums,
    };
  }

  async postProcess(): Promise<void> {
    try {
      execSync('rubocop -A', { cwd: this.options.outputDir, stdio: 'pipe' });
    } catch { /* not available */ }
  }
}

export default RubyEmitter;
