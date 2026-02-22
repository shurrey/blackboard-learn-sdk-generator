/**
 * Abstract base emitter. All language emitters extend this.
 * Handles template loading, Handlebars rendering, file writing, and post-processing.
 */

import Handlebars from 'handlebars';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SDKIR, Resource, Method, Model, EnumDef, TypeRef } from '../ir/types.js';
import { camelCase, pascalCase, snakeCase } from './shared/case-utils.js';

export { camelCase, pascalCase, snakeCase } from './shared/case-utils.js';

export interface EmitterOptions {
  outputDir: string;
  skipFormat: boolean;
  verbose: boolean;
}

export interface FileOutput {
  /** Relative path within the output directory */
  path: string;
  /** Rendered content */
  content: string;
}

export abstract class BaseEmitter {
  protected ir: SDKIR;
  protected langConfig: any;
  protected options: EmitterOptions;
  protected handlebars: typeof Handlebars;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    this.ir = ir;
    this.langConfig = langConfig;
    this.options = options;
    this.handlebars = Handlebars.create();
    this.registerCommonHelpers();
    this.registerHelpers();
    this.registerPartials();
  }

  /**
   * The language name (e.g., "python", "typescript").
   */
  abstract get language(): string;

  /**
   * Register language-specific Handlebars helpers.
   */
  abstract registerHelpers(): void;

  /**
   * Register language-specific Handlebars partials.
   */
  registerPartials(): void {
    // Override in subclasses to register partials
  }

  /**
   * Get the map of template name → output file path.
   */
  abstract getOutputStructure(): Map<string, string>;

  /**
   * Get the template context for a given template.
   */
  abstract getTemplateContext(templateName: string): any;

  /**
   * Run post-generation formatting (e.g., prettier, ruff, gofmt).
   */
  abstract postProcess(): Promise<void>;

  /**
   * Emit all files for this language.
   */
  async emit(): Promise<void> {
    // Clean and recreate output directory to remove stale files from prior runs
    if (existsSync(this.options.outputDir)) {
      rmSync(this.options.outputDir, { recursive: true, force: true });
    }
    mkdirSync(this.options.outputDir, { recursive: true });

    // Render templates
    const outputStructure = this.getOutputStructure();
    for (const [templateName, outputPath] of outputStructure) {
      const context = this.getTemplateContext(templateName);
      const content = this.renderTemplate(templateName, context);
      this.writeOutput(outputPath, content);
    }

    // Copy fixture files
    this.copyFixtures();

    // Post-process (format)
    if (!this.options.skipFormat) {
      try {
        await this.postProcess();
      } catch (err: any) {
        if (this.options.verbose) {
          console.warn(`  Post-processing warning: ${err.message}`);
        }
      }
    }
  }

  /**
   * Load and compile a Handlebars template.
   */
  protected loadTemplate(templateName: string): HandlebarsTemplateDelegate {
    const templateDir = join(import.meta.dirname, this.language, 'templates');
    const templatePath = join(templateDir, `${templateName}.hbs`);

    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const source = readFileSync(templatePath, 'utf-8');
    return this.handlebars.compile(source, { noEscape: true });
  }

  /**
   * Render a template with the given context.
   * Maps common prefixes (test:, resource:, model:, enum:) to template files.
   */
  protected renderTemplate(templateName: string, context: any): string {
    let actual = templateName;
    if (templateName.startsWith('test:')) actual = 'unit-test';
    else if (templateName.startsWith('resource:')) actual = 'resource';
    else if (templateName.startsWith('model:')) actual = 'model';
    else if (templateName.startsWith('enum:')) actual = 'enum';
    return this.loadTemplate(actual)(context);
  }

  /**
   * Write rendered content to the output directory.
   */
  protected writeOutput(relativePath: string, content: string): void {
    const fullPath = join(this.options.outputDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);

    if (this.options.verbose) {
      console.log(`  Wrote: ${relativePath}`);
    }
  }

  /**
   * Copy static fixture files to the output directory.
   */
  protected copyFixtures(): void {
    const fixturesDir = join(import.meta.dirname, this.language, 'fixtures');
    if (existsSync(fixturesDir)) {
      cpSync(fixturesDir, this.options.outputDir, { recursive: true });
      if (this.options.verbose) {
        console.log(`  Copied fixtures from ${fixturesDir}`);
      }
    }
  }

  /**
   * Register common Handlebars helpers shared across all languages.
   */
  private registerCommonHelpers(): void {
    const hbs = this.handlebars;

    // String helpers
    hbs.registerHelper('eq', (a, b) => a === b);
    hbs.registerHelper('neq', (a, b) => a !== b);
    hbs.registerHelper('or', (...args) => {
      args.pop(); // Remove Handlebars options
      return args.some(Boolean);
    });
    hbs.registerHelper('and', (...args) => {
      args.pop();
      return args.every(Boolean);
    });
    hbs.registerHelper('not', (a) => !a);

    hbs.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
    hbs.registerHelper('join', (arr: string[], sep: string) => arr?.join(sep) ?? '');

    hbs.registerHelper('lowercase', (s: string) => s?.toLowerCase() ?? '');
    hbs.registerHelper('uppercase', (s: string) => s?.toUpperCase() ?? '');

    // Collapse multi-line text to a single line (strips markdown tables, bold markers)
    hbs.registerHelper('singleLine', (s: string) => {
      if (!s) return '';
      const result = s
        .replace(/\r\n?/g, '\n')
        .replace(/\n\s*\|[-\s|]+\|\s*\n/g, ' ')   // strip markdown table separators
        .replace(/\n\s*\|/g, ' ')                    // strip markdown table rows
        .replace(/\*\*/g, '')                         // strip bold markers
        .replace(/\n+/g, ' ')                         // collapse newlines
        .replace(/\s+/g, ' ')                         // collapse whitespace
        .trim();
      return result;
    });

    // Casing helpers (used by all language templates)
    hbs.registerHelper('camelCase', (s: string) => camelCase(s));
    hbs.registerHelper('PascalCase', (s: string) => pascalCase(s));
    hbs.registerHelper('snakeCase', (s: string) => snakeCase(s));

    // Collection helpers
    hbs.registerHelper('hasItems', (arr: any[]) => arr && arr.length > 0);
    hbs.registerHelper('length', (arr: any[]) => arr?.length ?? 0);
    hbs.registerHelper('first', (arr: any[]) => arr?.[0]);
    hbs.registerHelper('last', (arr: any[]) => arr?.[arr.length - 1]);

    // Conditional helpers
    hbs.registerHelper('ifPaginated', function (this: any, method: Method, options: any) {
      return method.paginated ? options.fn(this) : options.inverse(this);
    });

    hbs.registerHelper('ifHasBody', function (this: any, method: Method, options: any) {
      return method.requestBody ? options.fn(this) : options.inverse(this);
    });

    hbs.registerHelper('ifHasSubresources', function (this: any, resource: Resource, options: any) {
      return resource.subresources.length > 0 ? options.fn(this) : options.inverse(this);
    });

    // Type helpers
    hbs.registerHelper('isPrimitive', (type: TypeRef) => type?.kind === 'primitive');
    hbs.registerHelper('isModel', (type: TypeRef) => type?.kind === 'model');
    hbs.registerHelper('isArray', (type: TypeRef) => type?.kind === 'array');
    hbs.registerHelper('isEnum', (type: TypeRef) => type?.kind === 'enum');
    hbs.registerHelper('isVoid', (type: TypeRef) => type?.kind === 'void');

    // Indentation helper
    hbs.registerHelper('indent', (text: string, spaces: number) => {
      if (!text) return '';
      const pad = ' '.repeat(spaces);
      return text.split('\n').map(line => pad + line).join('\n');
    });

    // Comment helper
    hbs.registerHelper('blockComment', (text: string, prefix: string) => {
      if (!text) return '';
      return text.split('\n').map(line => `${prefix} ${line}`).join('\n');
    });
  }

  /**
   * Flatten the resource tree for iteration.
   */
  protected flattenResources(resources: Resource[] = this.ir.resources): Resource[] {
    const result: Resource[] = [];
    for (const resource of resources) {
      result.push(resource);
      result.push(...this.flattenResources(resource.subresources));
    }
    return result;
  }

  /**
   * Find a resource by name in the flattened tree.
   */
  protected findResource(name: string): Resource | undefined {
    return this.flattenResources().find(r => r.name === name);
  }

  /**
   * Get imports needed by a resource file.
   */
  protected getResourceImports(resource: Resource): Record<string, string[]> {
    const imports: Record<string, string[]> = {};

    for (const method of resource.methods) {
      this.collectTypeImports(method.response.type, imports);
      if (method.requestBody) {
        this.collectTypeImports(method.requestBody.type, imports);
      }
      if (method.paginationConfig) {
        this.collectTypeImports(method.paginationConfig.itemType, imports);
      }
    }

    return imports;
  }

  /**
   * Get imports needed by a model file.
   */
  protected getModelImports(model: Model): Record<string, string[]> {
    const imports: Record<string, string[]> = {};

    for (const prop of model.properties) {
      this.collectTypeImports(prop.type, imports);
    }

    // Don't self-import
    delete imports[model.originalName ?? model.name];

    return imports;
  }

  /**
   * Collect type references that need to be imported.
   */
  protected collectTypeImports(type: TypeRef, imports: Record<string, string[]>): void {
    switch (type.kind) {
      case 'model': {
        const model = this.ir.models.find(m => m.name === type.name);
        const key = model?.originalName ?? type.name;
        if (!imports[key]) imports[key] = [];
        if (!imports[key].includes(type.name)) {
          imports[key].push(type.name);
        }
        break;
      }
      case 'array':
        this.collectTypeImports(type.items, imports);
        break;
      case 'union':
        for (const t of type.types) {
          this.collectTypeImports(t, imports);
        }
        break;
      case 'map':
        this.collectTypeImports(type.valueType, imports);
        break;
      case 'enum': {
        if (!imports[type.name]) imports[type.name] = [];
        if (!imports[type.name].includes(type.name)) {
          imports[type.name].push(type.name);
        }
        break;
      }
    }
  }
}
