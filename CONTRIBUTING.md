# Contributing to Mycelium Memory Hub

Thanks for your interest in contributing. Here's how to get started.

## Development Setup

```bash
git clone https://github.com/scri-ai/mycelium-memory-hub.git
cd mycelium-memory-hub
cp .env.example .env
npm install
npm run dev
```

The server starts on `http://localhost:3002` with hot reload via nodemon.

## Project Structure

```
core/           Main server, context manager, project scanner
api/            REST API routes
bridges/        Platform bridges (web chat, VS Code, mycelium, external)
database/       SQLite (dev) and PostgreSQL (prod) database layer
federation/     Federation Hub v2 — distributed mesh services
mcp-server/     MCP servers for Claude Desktop / VS Code / Kiro
config/         Entity and constellation configuration
tests/          Unit and integration tests
```

## Running Tests

```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
```

## Code Style

- Standard JavaScript (CommonJS modules)
- Use `async/await` over raw promises
- Error handling: wrap async route handlers in try/catch
- Keep functions focused — one job per function

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit with a clear message describing the change
6. Push and open a Pull Request against `main`

## Reporting Bugs

Use [GitHub Issues](https://github.com/scri-ai/mycelium-memory-hub/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Relevant logs or error messages

## Questions

Use [GitHub Discussions](https://github.com/scri-ai/mycelium-memory-hub/discussions) for questions, ideas, and general conversation.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
