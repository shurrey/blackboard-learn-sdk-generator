# Contributing to Blackboard LMS SDK Generator

Thank you for your interest in improving the Blackboard LMS SDK Generator!

## How This Project Works

This repository contains a code generator that produces language-specific SDKs
(TypeScript, Python, Java, C#, Go, Ruby) and an MCP server from the Blackboard
Learn REST API specification. The generated SDKs live in the `output/` directory
and are published to their own repositories.

## Ways to Contribute

### Report Bugs

If you find a bug in a generated SDK, please open an issue in this repository.
Include:

- Which SDK language is affected
- Steps to reproduce the problem
- Expected vs actual behavior
- The SDK version (from the generated README or package metadata)

### Request Features

Open an issue describing the feature you'd like to see. For SDK-level features
(new methods, better types, etc.), the change will likely need to happen in the
generator templates rather than in the generated code directly.

### Submit Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes to the generator (not the `output/` directory)
4. Run `npm run build && npm test` to verify
5. Run `tsx bin/generate.ts all` to regenerate SDKs and inspect the output
6. Open a pull request with a clear description of the change

### Important Guidelines

- **Do not edit generated SDK code directly.** Changes to files in `output/`
  will be overwritten on the next generation run. Instead, modify the
  corresponding Handlebars template in `emitters/<language>/templates/` or the
  emitter logic in `emitters/<language>/emitter.ts`.
- **Generator tests must pass.** Run `npm test` before submitting.
- **Follow existing patterns.** Look at how existing emitters and templates
  are structured before adding new ones.

## Development Setup

```bash
npm install
npm run build
npm test

# Generate all SDKs
tsx bin/generate.ts all

# Generate a specific language
tsx bin/generate.ts typescript
```

## License

By contributing, you agree that your contributions will be licensed under the
Apache License 2.0.
