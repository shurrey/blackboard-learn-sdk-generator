/**
 * Go SDK emitter.
 * Generates a complete Go SDK using net/http and functional options.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerGoHelpers, typeRefToGo } from './helpers.js';
import { snakeCase } from '../shared/case-utils.js';
import type { SDKIR, Resource, Model } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class GoEmitter extends BaseEmitter {
  private goModule: string;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.goModule = langConfig.module ?? 'github.com/blackboard/learn-go';
  }

  get language(): string {
    return 'go';
  }

  registerHelpers(): void {
    registerGoHelpers(this.handlebars);
    this.handlebars.registerHelper('goModule', () => this.goModule);
    // Check if any model property uses time.Time
    this.handlebars.registerHelper('needsTimeImport', (model: Model) => {
      return model.properties.some(p => {
        const goType = typeRefToGo(p.type);
        return goType === 'time.Time';
      });
    });
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    files.set('client', 'client.go');
    files.set('http-client', 'http_client.go');
    files.set('auth', 'auth.go');
    files.set('pagination', 'pagination.go');
    files.set('errors', 'errors.go');
    files.set('go-mod', 'go.mod');

    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(`resource:${resource.name}`, `${resource.name}.go`);
    }

    // Test files — one per resource (Go convention: same directory, _test.go suffix)
    for (const resource of allResources) {
      files.set(`test:${resource.name}`, `${resource.name}_test.go`);
    }

    for (const model of this.ir.models) {
      const fileName = snakeCase(model.originalName ?? model.name);
      files.set(`model:${model.originalName ?? model.name}`, `types_${fileName}.go`);
    }

    for (const enumDef of this.ir.enums) {
      const fileName = snakeCase(enumDef.name);
      files.set(`enum:${enumDef.name}`, `types_${fileName}.go`);
    }

    // Documentation
    files.set('readme', 'README.md');
    files.set('authentication', 'docs/authentication.md');
    for (const resource of allResources) {
      files.set(`doc:${resource.name}`, `docs/${resource.name}.md`);
    }

    // Integration tests
    files.set('integration:all', 'integration_test.go');

    return files;
  }

  getTemplateContext(templateName: string): any {
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
      goModule: this.goModule,
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
    if (templateName.startsWith('enum:')) {
      const name = templateName.slice('enum:'.length);
      const enumDef = this.ir.enums.find(e => e.name === name);
      return { ...base, enumDef };
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
    const gopath = process.env.GOPATH ?? `${process.env.HOME}/go`;
    const env = { ...process.env, PATH: `${gopath}/bin:${process.env.PATH}` };
    try {
      execSync('goimports -w .', { cwd: this.options.outputDir, stdio: 'pipe', env });
    } catch { /* goimports not available */ }
    try {
      execSync('gofmt -w .', { cwd: this.options.outputDir, stdio: 'pipe' });
    } catch { /* gofmt not available */ }
  }
}

export default GoEmitter;
