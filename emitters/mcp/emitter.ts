/**
 * MCP Server emitter.
 * Generates a Python FastMCP server project that exposes Blackboard LMS
 * REST API operations as MCP tools for AI agents.
 *
 * Unlike the SDK emitters (Python, TypeScript, etc.) which generate a 1-to-1
 * mapping of every REST endpoint, the MCP emitter produces a curated set of
 * ~12 high-level tools optimized for agent ergonomics. Tool definitions are
 * read from tool-design.yaml rather than derived purely from the IR.
 */

import { BaseEmitter, type EmitterOptions } from '../base-emitter.js';
import { registerMCPHelpers } from './helpers.js';
import type { SDKIR } from '../../ir/types.js';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  enum?: string[];
  description: string;
}

interface ToolDef {
  name: string;
  description: string;
  category: string;
  params: ToolParam[];
  rest_mapping: any;
  response_format?: string;
}

interface ToolDesign {
  tools: ToolDef[];
}

export class MCPEmitter extends BaseEmitter {
  private toolDesign: ToolDesign;

  constructor(ir: SDKIR, langConfig: any, options: EmitterOptions) {
    super(ir, langConfig, options);
    this.toolDesign = this.loadToolDesign();
  }

  get language(): string {
    return 'mcp';
  }

  registerHelpers(): void {
    registerMCPHelpers(this.handlebars);

    // Additional MCP-specific helpers
    const hbs = this.handlebars;

    hbs.registerHelper('toolsByCategory', (category: string) => {
      return this.toolDesign.tools.filter(t => t.category === category);
    });

    hbs.registerHelper('isRequired', (param: ToolParam) => param.required);

    hbs.registerHelper('hasDefault', (param: ToolParam) => param.default !== undefined);

    hbs.registerHelper('hasEnum', (param: ToolParam) => {
      return param.enum && param.enum.length > 0;
    });

    hbs.registerHelper('pyParamType', (param: ToolParam) => {
      if (param.enum && param.enum.length > 0) {
        return `Literal[${param.enum.map(v => `"${v}"`).join(', ')}]`;
      }
      const typeMap: Record<string, string> = {
        str: 'str',
        int: 'int',
        float: 'float',
        bool: 'bool',
        dict: 'dict',
        list: 'list',
      };
      return typeMap[param.type] || 'str';
    });

    hbs.registerHelper('pyParamDefault', (param: ToolParam) => {
      if (param.default === undefined || param.default === null) return 'None';
      if (typeof param.default === 'string') return `"${param.default}"`;
      if (typeof param.default === 'boolean') return param.default ? 'True' : 'False';
      return String(param.default);
    });

    hbs.registerHelper('pyParamSignature', (param: ToolParam) => {
      const typeStr = hbs.helpers.pyParamType(param);
      if (param.required) {
        return `${param.name}: ${typeStr}`;
      }
      if (param.default !== undefined) {
        const defaultStr = hbs.helpers.pyParamDefault(param);
        return `${param.name}: ${typeStr} = ${defaultStr}`;
      }
      return `${param.name}: ${typeStr} | None = None`;
    });

    hbs.registerHelper('wrapDescription', (text: string, indent: number, width: number) => {
      if (!text) return '';
      const pad = ' '.repeat(indent);
      const maxWidth = width || 72;
      const words = text.trim().replace(/\s+/g, ' ').split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        if (currentLine.length + word.length + 1 > maxWidth) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = currentLine ? `${currentLine} ${word}` : word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines.map(line => `${pad}${line}`).join('\n');
    });
  }

  getOutputStructure(): Map<string, string> {
    const files = new Map<string, string>();

    // Package init
    files.set('init', 'src/blackboard_lms_mcp/__init__.py');

    // Main server
    files.set('server', 'src/blackboard_lms_mcp/server.py');

    // Subpackage __init__.py files
    files.set('tools-init', 'src/blackboard_lms_mcp/tools/__init__.py');
    files.set('auth-init', 'src/blackboard_lms_mcp/auth/__init__.py');
    files.set('utils-init', 'src/blackboard_lms_mcp/utils/__init__.py');

    // Tool modules by category
    const categories = this.getCategories();
    for (const category of categories) {
      files.set(`tool:${category}`, `src/blackboard_lms_mcp/tools/${category}.py`);
    }

    // Test files — one per tool category
    for (const category of categories) {
      files.set(`test:${category}`, `tests/test_${category}.py`);
    }

    // Auth modules
    files.set('auth-env', 'src/blackboard_lms_mcp/auth/env_auth.py');
    files.set('auth-oauth', 'src/blackboard_lms_mcp/auth/oauth_auth.py');

    // Utility modules
    files.set('formatter', 'src/blackboard_lms_mcp/utils/formatters.py');
    files.set('error-handler', 'src/blackboard_lms_mcp/utils/error_handler.py');

    // MCP resources and prompts
    files.set('resource-mcp', 'src/blackboard_lms_mcp/resources.py');
    files.set('prompt', 'src/blackboard_lms_mcp/prompts.py');

    // Build config
    files.set('pyproject-toml', 'pyproject.toml');

    // Documentation
    files.set('readme', 'README.md');
    files.set('authentication', 'docs/authentication.md');

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
      allTools: this.toolDesign.tools,
    };

    // Test templates — filtered by category
    if (templateName.startsWith('test:')) {
      const category = templateName.slice('test:'.length);
      const tools = this.toolDesign.tools.filter(t => t.category === category);

      return {
        ...base,
        category,
        tools,
      };
    }

    // Tool module templates — filtered by category
    if (templateName.startsWith('tool:')) {
      const category = templateName.slice('tool:'.length);
      const tools = this.toolDesign.tools.filter(t => t.category === category);

      return {
        ...base,
        category,
        tools,
      };
    }

    // Core templates get all tools plus IR data
    return {
      ...base,
      categories: this.getCategories(),
      topLevelResources: this.ir.resources,
      models: this.ir.models,
      enums: this.ir.enums,
      errors: this.ir.errors,
    };
  }

  protected renderTemplate(templateName: string, context: any): string {
    // MCP has unique tool: prefix mapping; delegate everything else to base
    if (templateName.startsWith('tool:')) {
      const category = templateName.slice('tool:'.length);
      const actualTemplate = category === 'dynamic' ? 'dynamic-tool' : 'tool';
      return this.loadTemplate(actualTemplate)(context);
    }
    // Subpackage __init__.py files are empty
    if (templateName.endsWith('-init') && templateName !== 'init') {
      return '';
    }
    return super.renderTemplate(templateName, context);
  }

  async postProcess(): Promise<void> {
    try {
      execSync('ruff format src/', {
        cwd: this.options.outputDir,
        stdio: 'pipe',
      });
    } catch {
      // ruff not available — skip formatting
      if (this.options.verbose) {
        console.warn('  ruff not available, skipping format');
      }
    }
  }

  /**
   * Load and parse the tool-design.yaml file.
   */
  private loadToolDesign(): ToolDesign {
    const designPath = join(import.meta.dirname, 'tool-design.yaml');
    const content = readFileSync(designPath, 'utf-8');
    return yaml.load(content) as ToolDesign;
  }

  /**
   * Get unique categories from tool definitions.
   */
  private getCategories(): string[] {
    const cats = new Set(this.toolDesign.tools.map(t => t.category));
    return Array.from(cats);
  }
}

export default MCPEmitter;
