# Contributing to Pulse CLI

We love contributions! Pulse CLI is an open-source project and we welcome
contributions of all kinds: bug reports, feature requests, documentation
improvements, and code changes.

## Code of Conduct

Be respectful, inclusive, and constructive. Pulse CLI is a community project
and we want everyone to feel welcome.

## Getting Started

1. Fork the repository.
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/pulse-cli.git`
3. Install dependencies: `npm install`
4. Link globally: `npm link`
5. Create a branch: `git checkout -b feature/your-feature`

## Development

```bash
# Run the CLI in development
node bin/pulse.js

# Run with auto-restart on file changes
npx nodemon bin/pulse.js

# Test your changes
node bin/pulse.js --version
```

## Project Structure

```
src/
├── index.js          # Entry point, argument parsing, routing
├── commands/         # CLI command implementations
│   ├── chat.js       # Interactive chat loop
│   ├── history.js    # Conversation history
│   ├── provider.js   # Provider listing/switching
│   └── configure.js  # Setup wizard
├── lib/              # Core infrastructure
│   ├── config.js     # Configuration loader
│   ├── errors.js     # Error handling
│   └── storage.js    # Conversation persistence
├── providers/        # LLM provider implementations
│   ├── base.js       # Abstract base class
│   ├── openai.js     # OpenAI-compatible
│   ├── kimi.js       # Moonshot/Kimi
│   ├── openrouter.js # OpenRouter
│   ├── gemini.js     # Google Gemini
│   └── ollama.js     # Local Ollama
└── ui/              # Terminal UI
    ├── banner.js    # Welcome screen
    ├── markdown.js  # Markdown rendering
    └── spinner.js   # Loading spinner
```

## Adding a Provider

1. Create `src/providers/yourprovider.js` extending `BaseProvider`
2. Implement `chatComplete()` and `streamChat()`
3. Add defaults in `src/lib/config.js` (`PROVIDER_DEFAULTS`)
4. Register in `src/providers/index.js`
5. Add provider info in `src/commands/provider.js`

See the [Gemini provider](src/providers/gemini.js) for an example of a
non-OpenAI-compatible provider implementation.

## Code Style

- Use CommonJS (`require`, `module.exports`)
- Use `const` over `let` where possible
- JSDoc comments on all public functions
- 2-space indentation
- Descriptive variable names

## Testing

```bash
# Test all modules load correctly
node -e "require('./src/index')"

# Test a specific module
node -e "
const { loadConfig } = require('./src/lib/config');
console.log(loadConfig({ provider: 'openai', apiKey: 'test' }));
"
```

## Pull Request Process

1. Update the README if your change affects the user-facing interface.
2. Update or add JSDoc comments for new/changed functions.
3. Run the CLI and verify your change works end-to-end.
4. Make sure existing functionality still works.
5. Open a PR with a clear title and description.

## Reporting Issues

- Search existing issues before opening a new one.
- Include your OS, Node.js version, and provider.
- Include the full error message and steps to reproduce.
- Remove any sensitive information (API keys, etc.).

## License

By contributing, you agree that your contributions will be licensed under
the MIT License.
