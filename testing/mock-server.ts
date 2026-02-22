/**
 * Prism mock server wrapper for contract tests.
 * Starts a Prism server against the transformed OpenAPI spec,
 * runs tests, then shuts down the server.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_PORT = 4010;
const PRISM_STARTUP_TIMEOUT = 10000;

export interface MockServerOptions {
  port?: number;
  specPath: string;
  verbose?: boolean;
}

export class MockServer {
  private process: ChildProcess | null = null;
  private port: number;
  private specPath: string;
  private verbose: boolean;

  constructor(options: MockServerOptions) {
    this.port = options.port ?? DEFAULT_PORT;
    this.specPath = options.specPath;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Start the Prism mock server.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Mock server is already running');
    }

    this.process = spawn('npx', [
      '@stoplight/prism-cli', 'mock',
      '--port', String(this.port),
      '--host', '127.0.0.1',
      '--dynamic',
      this.specPath,
    ], {
      stdio: this.verbose ? 'inherit' : 'pipe',
    });

    // Wait for server to be ready
    await this.waitForReady();
  }

  /**
   * Stop the Prism mock server.
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Get the base URL of the mock server.
   */
  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private async waitForReady(): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < PRISM_STARTUP_TIMEOUT) {
      try {
        const response = await fetch(`${this.baseUrl}/`);
        if (response.status !== 0) {
          return; // Server is up (even a 404 means it's ready)
        }
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Prism mock server did not start within ${PRISM_STARTUP_TIMEOUT}ms`);
  }
}

/**
 * Write the transformed spec to a file for Prism to use.
 */
export function writeSpecForMockServer(spec: any, outputDir: string): string {
  const specDir = join(outputDir, 'spec');
  if (!existsSync(specDir)) {
    mkdirSync(specDir, { recursive: true });
  }
  const specPath = join(specDir, 'openapi.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return specPath;
}
