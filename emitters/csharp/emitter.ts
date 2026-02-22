/**
 * C# SDK emitter.
 * Generates a complete .NET SDK using HttpClient and System.Text.Json.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerCSharpHelpers, typeRefToCSharp } from './helpers.js';
import { pascalCase } from '../shared/case-utils.js';
import type { SDKIR, Resource } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class CSharpEmitter extends BaseEmitter {
  private namespace: string;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.namespace = langConfig.namespace ?? 'Blackboard.Learn';
  }

  get language(): string {
    return 'csharp';
  }

  registerHelpers(): void {
    registerCSharpHelpers(this.handlebars);
    this.handlebars.registerHelper('csNamespace', () => this.namespace);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    files.set('client', `src/${this.namespace}/Client.cs`);
    files.set('http-client', `src/${this.namespace}/HttpClient.cs`);
    files.set('auth', `src/${this.namespace}/OAuth2Client.cs`);
    files.set('pagination', `src/${this.namespace}/Paginator.cs`);
    files.set('errors', `src/${this.namespace}/Errors.cs`);
    files.set('csproj', `src/${this.namespace}/${this.namespace}.csproj`);

    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(`resource:${resource.name}`, `src/${this.namespace}/Resources/${pascalCase(resource.name)}Resource.cs`);
    }

    // Test project
    files.set('test-csproj', `tests/${this.namespace}.Tests/${this.namespace}.Tests.csproj`);

    // Test files — one per resource
    for (const resource of allResources) {
      files.set(`test:${resource.name}`, `tests/${this.namespace}.Tests/Resources/${pascalCase(resource.name)}ResourceTests.cs`);
    }

    for (const model of this.ir.models) {
      files.set(`model:${model.originalName ?? model.name}`, `src/${this.namespace}/Types/${model.name}.cs`);
    }

    for (const enumDef of this.ir.enums) {
      files.set(`enum:${enumDef.name}`, `src/${this.namespace}/Types/${enumDef.name}.cs`);
    }

    // Documentation
    files.set('readme', 'README.md');
    files.set('authentication', 'docs/authentication.md');
    for (const resource of allResources) {
      files.set(`doc:${resource.name}`, `docs/${resource.name}.md`);
    }

    // Integration tests
    files.set('integration:all', `tests/${this.namespace}.Tests/Integration/IntegrationTests.cs`);

    return files;
  }

  getTemplateContext(templateName: string): any {
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
      namespace: this.namespace,
    };

    if (templateName === 'test-csproj') {
      return { ...base };
    }

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
    try {
      execSync('dotnet format', { cwd: this.options.outputDir, stdio: 'pipe' });
    } catch { /* not available */ }
  }
}

export default CSharpEmitter;
