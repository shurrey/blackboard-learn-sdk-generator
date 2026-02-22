/**
 * Java SDK emitter.
 * Generates a complete Java SDK using java.net.http.HttpClient and Jackson.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerJavaHelpers, typeRefToJava } from './helpers.js';
import { pascalCase } from '../shared/case-utils.js';
import type { SDKIR, Resource, Model, EnumDef, TypeRef } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class JavaEmitter extends BaseEmitter {
  private groupId: string;
  private artifactId: string;
  private basePackage: string;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.groupId = langConfig.groupId ?? 'com.blackboard';
    this.artifactId = langConfig.artifactId ?? 'learn-sdk';
    this.basePackage = `${this.groupId}.learn`;
  }

  get language(): string {
    return 'java';
  }

  registerHelpers(): void {
    registerJavaHelpers(this.handlebars);
    this.handlebars.registerHelper('javaPackage', () => this.basePackage);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();
    const srcDir = `src/main/java/${this.basePackage.replace(/\./g, '/')}`;

    // Core files
    files.set('client', `${srcDir}/Client.java`);
    files.set('http-client', `${srcDir}/HttpClient.java`);
    files.set('auth', `${srcDir}/OAuth2Client.java`);
    files.set('pagination', `${srcDir}/PaginatedIterator.java`);
    files.set('errors', `${srcDir}/errors/APIError.java`);

    // Build config
    files.set('pom', 'pom.xml');

    // Resources
    const allResources = this.flattenResources();
    for (const resource of allResources) {
      files.set(`resource:${resource.name}`, `${srcDir}/resources/${pascalCase(resource.name)}Resource.java`);
    }

    // Test files — one per resource
    const testDir = `src/test/java/${this.basePackage.replace(/\./g, '/')}`;
    for (const resource of allResources) {
      files.set(`test:${resource.name}`, `${testDir}/resources/${pascalCase(resource.name)}ResourceTest.java`);
    }

    // Models
    for (const model of this.ir.models) {
      files.set(`model:${model.originalName ?? model.name}`, `${srcDir}/types/${model.name}.java`);
    }

    // Enums
    for (const enumDef of this.ir.enums) {
      files.set(`enum:${enumDef.name}`, `${srcDir}/types/${enumDef.name}.java`);
    }

    return files;
  }

  getTemplateContext(templateName: string): any {
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
      basePackage: this.basePackage,
      groupId: this.groupId,
      artifactId: this.artifactId,
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
      execSync('google-java-format -i $(find . -name "*.java")', {
        cwd: this.options.outputDir,
        stdio: 'pipe',
      });
    } catch {
      // Formatter not available
    }
  }
}

export default JavaEmitter;
