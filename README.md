# Blackboard Learn SDK Generator

A code generator that produces idiomatic SDKs for the Blackboard Learn REST API in **7 targets**: TypeScript, Python, Java, C#, Go, Ruby, and an MCP server.

## System Requirements

### All Platforms

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | >= 20.0.0 | Runtime for the generator |
| **npm** | >= 10 | Package management |
| **tsx** | >= 4.15 | TypeScript execution (installed as devDependency) |

### macOS

```bash
# Install Node.js via Homebrew
brew install node@22

# Or via nvm
nvm install 22
nvm use 22
```

### Windows

```powershell
# Install Node.js via winget
winget install OpenJS.NodeJS.LTS

# Or download the installer from https://nodejs.org/
```

### Linux (Debian/Ubuntu)

```bash
# Install via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Language-Specific Tools (Optional)

These are only needed if you want post-generation formatting or to run the generated SDKs locally:

| Language | Runtime | Formatter | Notes |
|---|---|---|---|
| **TypeScript** | Node.js >= 22 | prettier | `npm install` in output dir |
| **Python** | Python >= 3.12 | ruff | `pip install ruff` |
| **Java** | JDK >= 21 | google-java-format | Download from GitHub releases |
| **C#** | .NET >= 9.0 | dotnet-format | Included with .NET SDK |
| **Go** | Go >= 1.24 | gofmt | Included with Go |
| **Ruby** | Ruby >= 3.4 | rubocop | `gem install rubocop` |

## Installation

```bash
cd blackboard-learn-sdk-generator
npm install
```

## Configuration

All generator settings live in `generator.config.yaml`:

```yaml
sdk:
  name: blackboard-learn        # SDK name prefix
  version: "1.0.0"              # Version stamped into generated SDKs
  license: Apache-2.0

api:
  baseUrl: "https://{domain}/learn/api/public"
  specUrl: "https://developer.blackboard.com/portal/docs/apis/learn-swagger.json"
```

### Resources

The `resources` section maps API endpoints to SDK resource classes. Each resource can have methods (`list`, `get`, `create`, `update`, `delete`) mapped to OpenAPI `operationId` values, plus nested `subresources`:

```yaml
resources:
  courses:
    methods:
      list: { operationId: "GetCourses" }
      get: { operationId: "GetCourse" }
      create: { operationId: "CreateCourse" }
    subresources:
      contents:
        methods:
          list: { operationId: "GetContents" }
```

### Authentication

The `auth` section configures OAuth 2.0 endpoints. Blackboard Learn supports two-legged (client_credentials) and three-legged (authorization_code + PKCE) flows:

```yaml
auth:
  twoLegged:
    tokenEndpoint: /learn/api/public/v1/oauth2/token
    grantType: client_credentials
  threeLegged:
    authorizeEndpoint: /learn/api/public/v1/oauth2/authorizationcode
    tokenEndpoint: /learn/api/public/v1/oauth2/token
    grantType: authorization_code
    pkce: true
```

### Language Settings

Each language target has its own configuration block under `languages`:

```yaml
languages:
  python:
    packageName: blackboard-learn
    moduleName: blackboard_learn
    minVersion: "3.12"
    httpClient: httpx
    formatter: ruff
  typescript:
    packageName: "@blackboard/learn-sdk"
    minVersion: "node22"
    httpClient: fetch
    formatter: prettier
  # ... java, csharp, go, ruby
```

### Pagination

```yaml
pagination:
  style: offset
  offsetParam: offset
  limitParam: limit
  defaultLimit: 100
  resultsField: results
  nextPageField: paging.nextPage
```

### ID Formats

```yaml
idFormats:
  formats:
    - "primary ID"
    - "externalId:{id}"
    - "userName:{name}"
    - "uuid:{uuid}"
```

## Usage

### Generate SDKs

```bash
# Generate all targets
npm run generate -- all

# Generate a single target
npm run generate -- typescript
npm run generate -- python
npm run generate -- java
npm run generate -- csharp
npm run generate -- go
npm run generate -- ruby
npm run generate -- mcp
```

### CLI Options

```bash
npm run generate -- <target> [options]

Options:
  --spec <url|path>    Override the spec URL or use a local file
  --config <path>      Override config file path (default: ./generator.config.yaml)
  --output <dir>       Override output directory (default: ./output)
  --skip-download      Use the cached spec instead of re-downloading
  --skip-format        Skip post-generation code formatting
  --dry-run            Preview what would be generated without writing files
  --verbose            Enable verbose logging
```

### Version Management

```bash
# Bump the SDK version (updates generator.config.yaml and package.json)
npm run version:bump -- patch   # 1.0.0 → 1.0.1
npm run version:bump -- minor   # 1.0.0 → 1.1.0
npm run version:bump -- major   # 1.0.0 → 2.0.0

# Generate a changelog from git history
npm run changelog
```

### Spec Tools

```bash
# Vendor the upstream spec locally (saves to spec/vendored/)
npm run spec:vendor

# Diff vendored spec against upstream for API changes
npm run spec:diff

# Audit resource coverage (operations mapped vs unmapped)
npm run audit:resources
```

### Testing

```bash
# Run generator unit tests
npm test

# Run integration tests against a Prism mock server
npm run test:integration -- typescript

# Run a generated SDK's own test suite
npm run test:sdk -- typescript

# Type-check the generator source
npm run typecheck
```

## How It Works

The generator follows a four-stage pipeline:

```
OpenAPI Spec → Spec Pipeline → IR Builder → Emitters → SDK Output
```

### Stage 1: Spec Pipeline (`spec/`)

1. **Download** — Fetches the Blackboard Learn Swagger 2.0 spec (or loads from local file/cache)
2. **Convert** — Converts Swagger 2.0 to OpenAPI 3.0 using `swagger2openapi`
3. **Transform** — Applies a chain of transforms to fix and enrich the spec:
   - `fix-auth-schemes` — Normalizes OAuth security schemes
   - `fix-operation-ids` — Ensures every operation has a unique, consistent ID
   - `add-pagination-ext` — Tags paginated endpoints with `x-pagination` extensions
   - `normalize-errors` — Standardizes error response schemas
   - `add-resource-tags` — Groups operations into resources using tags
4. **Validate** — Validates the transformed spec via `@apidevtools/swagger-parser`

### Stage 2: IR Builder (`ir/`)

The **Intermediate Representation (IR)** is a language-agnostic data structure (`SDKIR`) that captures everything needed to generate an SDK:

- **Metadata** — Name, version, license, base URL
- **Auth** — OAuth 2.0 endpoint configuration (2LO + 3LO)
- **Pagination** — Offset-based pagination config
- **Resources** — Hierarchical tree of API resources, each with typed methods
- **Models** — Request/response data classes with typed properties
- **Enums** — String enumeration types
- **Errors** — Error class hierarchy mapped to HTTP status codes
- **ID Formats** — Blackboard's multi-format ID system

The IR Builder reads `generator.config.yaml` to determine which operations map to which resources, then walks the OpenAPI spec to extract types, parameters, and documentation.

### Stage 3: Emitters (`emitters/`)

Each language has an emitter that extends `BaseEmitter`:

```
emitters/
├── base-emitter.ts          # Abstract base with shared logic
├── shared/case-utils.ts     # camelCase, PascalCase, snake_case
├── typescript/
│   ├── emitter.ts           # Output structure + template context
│   ├── helpers.ts           # TypeScript-specific Handlebars helpers
│   ├── templates/           # Handlebars templates (.hbs)
│   └── fixtures/            # Static files copied to output
├── python/
├── java/
├── csharp/
├── go/
├── ruby/
└── mcp/
```

The emitter:
1. Defines the **output structure** — maps template names to output file paths
2. Provides **template context** — selects the right IR data for each template
3. **Renders** Handlebars templates with language-specific helpers
4. Copies **fixture files** (e.g., `tsconfig.json`, `pyproject.toml`)
5. Runs **post-processing** (code formatters like prettier, ruff, gofmt)

### Stage 4: Output

Generated SDKs are written to `output/<sdk-name>-<language>/` with a complete project structure:

| Component | Description |
|---|---|
| `src/client.*` | Main SDK client with resource accessors |
| `src/http-client.*` | HTTP client with retry, rate limiting, Retry-After |
| `src/auth.*` | OAuth 2.0 (client_credentials + authorization_code + PKCE) |
| `src/pagination.*` | Lazy/async pagination iterators |
| `src/errors.*` | Typed error hierarchy (APIError, NotFoundError, RateLimitError) |
| `src/resources/` | One file per resource with typed methods |
| `src/types/` | Data models and enums |
| `tests/` | Unit tests for every resource |
| `tests/integration/` | Integration tests (run against Prism mock server) |
| `docs/` | Per-resource API documentation |
| `README.md` | SDK-specific getting started guide |
| `AGENT.md` | AI coding assistant guide with architecture and usage |
| `CONTRIBUTING.md` | Contribution guidelines (directs to issues) |
| `LICENSE` | Apache-2.0 license |
| `.gitignore` | Language-specific ignore rules |
| `.github/workflows/ci.yml` | CI pipeline (lint, unit tests, integration tests) |

## Project Structure

```
blackboard-learn-sdk-generator/
├── .github/workflows/
│   ├── ci.yml                # Generator CI (lint, test, typecheck)
│   ├── release.yml           # SDK release automation
│   └── spec-check.yml        # Upstream spec change detection
├── bin/
│   ├── generate.ts           # Main CLI entry point
│   ├── bump-version.ts       # Version bumping script
│   ├── changelog.ts          # Changelog generator (includes API changes)
│   ├── spec-diff.ts          # CLI for diffing vendored vs upstream spec
│   ├── spec-vendor.ts        # Vendor upstream spec locally
│   ├── audit-resources.ts    # Audit resource/operation coverage
│   ├── test-sdk.ts           # Run a generated SDK's test suite
│   └── test-integration.ts   # Integration test runner
├── spec/
│   ├── index.ts              # Spec pipeline orchestration
│   ├── download.ts           # Spec fetcher with caching
│   ├── convert.ts            # Swagger 2.0 → OpenAPI 3.0
│   ├── validate.ts           # Spec validation
│   ├── diff.ts               # Shared spec diff module
│   ├── transforms/           # Spec transform chain
│   ├── cache/                # Cached spec files
│   └── vendored/             # Vendored spec snapshots
├── ir/
│   ├── builder.ts            # IR construction from OpenAPI
│   └── types.ts              # IR type definitions
├── emitters/
│   ├── base-emitter.ts       # Abstract base emitter
│   ├── typescript/           # TypeScript SDK emitter
│   ├── python/               # Python SDK emitter
│   ├── java/                 # Java SDK emitter
│   ├── csharp/               # C# SDK emitter
│   ├── go/                   # Go SDK emitter
│   ├── ruby/                 # Ruby SDK emitter
│   └── mcp/                  # MCP server emitter
├── testing/
│   ├── mock-server.ts        # Prism mock server wrapper
│   ├── test-templates/       # Templates for generated test suites
│   └── contracts/            # API contracts for testing
├── output/                   # Generated SDKs (git-ignored)
├── generator.config.yaml     # Generator configuration
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── LICENSE                   # Apache-2.0
└── CONTRIBUTING.md           # Contribution guide
```

## License

Apache-2.0
