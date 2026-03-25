/**
 * CLI emitter.
 * Generates a Go CLI application using Cobra that wraps the generated Go SDK.
 * The CLI provides resource-based subcommands (e.g., `bblms courses list`)
 * with auth via OS keychain, config file, env vars, or flags.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerCLIHelpers, commandVarName } from './helpers.js';
import { registerGoHelpers } from '../go/helpers.js';
import { snakeCase } from '../shared/case-utils.js';
import type { SDKIR, Resource } from '../../ir/types.js';
import { execSync } from 'node:child_process';

export class CLIEmitter extends BaseEmitter {
  private cliModule: string;
  private sdkModule: string;
  private binaryName: string;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.cliModule = langConfig.module ?? 'github.com/blackboard/bblms-cli';
    this.sdkModule = langConfig.sdkModule ?? 'github.com/blackboard/lms-go';
    this.binaryName = langConfig.binaryName ?? 'bblms';
  }

  get language(): string {
    return 'cli';
  }

  registerHelpers(): void {
    registerGoHelpers(this.handlebars);
    registerCLIHelpers(this.handlebars);

    this.handlebars.registerHelper('cliModule', () => this.cliModule);
    this.handlebars.registerHelper('sdkModule', () => this.sdkModule);
    this.handlebars.registerHelper('binaryName', () => this.binaryName);
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    // Entry point
    files.set('main', 'main.go');

    // Core command infrastructure
    files.set('root', 'cmd/root.go');
    files.set('configure', 'cmd/configure.go');
    files.set('auth-cmd', 'cmd/auth.go');

    // Internal packages
    files.set('config', 'internal/config/config.go');
    files.set('keyring', 'internal/keyring/keyring.go');
    files.set('output', 'internal/output/output.go');
    files.set('sdk-factory', 'internal/sdk/factory.go');

    // Per-resource command files
    const allResources = this.getReachableResources();
    for (const resource of allResources) {
      files.set(`cmd:${resource.name}`, `cmd/${snakeCase(resource.name)}.go`);
    }

    // Build config
    files.set('go-mod', 'go.mod');
    files.set('goreleaser', '.goreleaser.yaml');

    // Documentation
    files.set('readme', 'README.md');
    files.set('contributing', 'CONTRIBUTING.md');
    files.set('ci-workflow', '.github/workflows/ci.yml');
    files.set('agent-md', 'AGENT.md');

    return files;
  }

  getTemplateContext(templateName: string): any {
    const allResources = this.getReachableResources();
    const base = {
      metadata: this.ir.metadata,
      auth: this.ir.auth,
      pagination: this.ir.pagination,
      langConfig: this.langConfig,
      cliModule: this.cliModule,
      sdkModule: this.sdkModule,
      binaryName: this.binaryName,
    };

    // Per-resource command templates
    if (templateName.startsWith('cmd:')) {
      const name = templateName.slice('cmd:'.length);
      const resource = allResources.find(r => r.name === name);
      return {
        ...base,
        resource,
        parentCmdVar: this.getParentCmdVar(resource!),
        allResources,
        topLevelResources: this.ir.resources,
      };
    }

    // Root command needs the top-level resources to register subcommands
    if (templateName === 'root') {
      return {
        ...base,
        topLevelResources: this.ir.resources,
        allResources,
      };
    }

    // Readme needs resource tree
    if (templateName === 'readme' || templateName === 'agent-md') {
      return {
        ...base,
        topLevelResources: this.ir.resources,
        allResources,
      };
    }

    return {
      ...base,
      topLevelResources: this.ir.resources,
      allResources,
      models: this.ir.models,
      enums: this.ir.enums,
      errors: this.ir.errors,
      idFormats: this.ir.idFormats,
    };
  }

  protected renderTemplate(templateName: string, context: any): string {
    if (templateName.startsWith('cmd:')) {
      return this.loadTemplate('command')(context);
    }
    return super.renderTemplate(templateName, context);
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

  /**
   * Get resources that are reachable through the Go SDK's canonical resource chain.
   * Since Go SDK generates one struct per resource name (using the first occurrence's
   * sub-resources), deeper resources may not be accessible if their parent resource
   * name was first seen with a different set of sub-resources.
   */
  private getReachableResources(): Resource[] {
    const all = this.flattenResources();

    // Build canonical maps from first occurrence of each resource name.
    // The Go SDK generates one struct per unique name using the first occurrence's
    // sub-resources and methods.
    const canonicalSubresources = new Map<string, Set<string>>();
    const canonicalMethods = new Map<string, any[]>();
    for (const r of all) {
      if (!canonicalSubresources.has(r.name)) {
        canonicalSubresources.set(r.name, new Set(r.subresources.map(s => s.name)));
        canonicalMethods.set(r.name, r.methods);
      }
    }

    const isReachable = (path: string): boolean => {
      if (!path) return true;
      const segments = path.split('.');
      for (let i = 0; i < segments.length - 1; i++) {
        const parentSubs = canonicalSubresources.get(segments[i]);
        if (!parentSubs || !parentSubs.has(segments[i + 1])) {
          return false;
        }
      }
      return true;
    };

    return all
      .filter(r => isReachable(r.path ?? r.name))
      .map(r => ({
        ...r,
        // Use canonical methods (what the Go SDK struct actually has)
        methods: canonicalMethods.get(r.name) ?? [],
      }))
      // Keep only resources that have at least one non-upload method
      .filter(r => r.methods.some(m => !m.requestBody?.binary));
  }

  /**
   * Get the parent Cobra command variable name for a resource.
   */
  private getParentCmdVar(resource: Resource): string {
    const path = resource.path ?? resource.name;
    const parts = path.split('.');
    if (parts.length <= 1) return 'rootCmd';
    const parentName = parts.slice(0, -1).join('.');
    const parent = this.getReachableResources().find(r => (r.path ?? r.name) === parentName);
    return parent ? commandVarName(parent) : 'rootCmd';
  }
}

export default CLIEmitter;
