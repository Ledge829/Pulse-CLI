<div align="center">
  <br>
  <pre>
  ╭────────────────────────────────────╮
  │  ♥ Pulse CLI  v1.0.0              │
  │  BYOK AI Coding Assistant          │
  │  Fast · Modular · Provider Agnostic│
  ╰────────────────────────────────────╯
  </pre>
  <br>
  <p>
    <strong>Fast, provider-agnostic AI coding assistant for your terminal.</strong>
  </p>
  <p>
    <strong>Bring Your Own Key.</strong> Any provider. All from your terminal.
  </p>
  <br>
  <p>
    <a href="#features"><img src="https://img.shields.io/badge/Features-★-cyan" alt="Features"></a>
    <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-→-blue" alt="Quick Start"></a>
    <a href="#configuration"><img src="https://img.shields.io/badge/Configuration-→-blue" alt="Configuration"></a>
    <a href="#providers"><img src="https://img.shields.io/badge/Providers-5-green" alt="5 Providers"></a>
    <a href="#roadmap"><img src="https://img.shields.io/badge/Roadmap-→-orange" alt="Roadmap"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node >= 18"></a>
  </p>
  <br>
</div>

---

**Pulse CLI** is a fast, cross-platform AI coding assistant that runs entirely in your terminal. It uses a **Bring Your Own Key (BYOK)** architecture — you choose the provider, you manage the credentials, and Pulse CLI handles the rest.

> ⚠️ **Disclaimer:** Pulse CLI is an independent open-source project and is **not affiliated, endorsed, or sponsored** by OpenAI, Moonshot AI, Google, OpenRouter, Ollama, or any other AI provider. All trademarks and service marks belong to their respective owners.

## Features

- **BYOK (Bring Your Own Key)** — Your credentials, your choice of provider. No vendor lock-in.
- **5 providers out of the box** — OpenAI, Kimi (Moonshot), OpenRouter, Google Gemini, Ollama (local).
- **Any OpenAI-compatible provider** — Together AI, Groq, LocalAI, Azure OpenAI, etc.
- **Interactive chat** — Streaming responses, multiline input, markdown rendering.
- **Slash commands** — `/help`, `/clear`, `/exit`, `/history`, `/model`, `/provider`, `/new`.
- **Conversation persistence** — Auto-saved; resumes where you left off.
- **Provider management** — `pulse provider` to list and switch providers.
- **Setup wizard** — `pulse configure` guides you through provider and API key setup.
- **No telemetry** — Zero data collection. Conversations stay on your machine.
- **Cross-platform** — Linux, macOS, Windows, Termux (Node.js ≥ 18).
- **Minimal dependencies** — Just `chalk`, `ora`, and `dotenv`.

## Quick Start

```bash
# Install globally
npm install -g pulse-cli

# Or clone and link
git clone https://github.com/pulse-cli/pulse.git
cd pulse
npm install
npm link

# Run the setup wizard
pulse configure

# Start chatting!
pulse
```

### One-liner to start

```bash
# Set your API key and start
PULSE_API_KEY=sk-... pulse
```

## Configuration

Pulse CLI reads configuration from these locations (later sources override):

1. **`$PWD/.env`** — Project-level configuration
2. **`~/.pulse/.env`** — User-level configuration (created by `pulse configure`)
3. **Environment variables** — `PROVIDER`, `API_KEY`, `BASE_URL`, `MODEL`

### Variables

| Variable    | Required    | Default                 | Description                          |
|-------------|-------------|-------------------------|--------------------------------------|
| `PROVIDER`  | No          | `openai`                | Provider name                        |
| `API_KEY`   | Yes*        | —                       | Your API key                         |
| `BASE_URL`  | No          | Provider-specific       | API endpoint URL                     |
| `MODEL`     | No          | Provider-specific       | Model name                           |

*\*Not required for Ollama (local models).*

### Setup

```bash
# Interactive wizard (recommended)
pulse configure

# Quick login (just sets the API key)
pulse login

# Or manually create .env
cp .env.example .env
# Edit .env with your provider and key
```

## Providers

| Provider    | Default Base URL                           | Default Model             | API Key Needed |
|-------------|--------------------------------------------|---------------------------|----------------|
| `openai`    | `https://api.openai.com/v1`                | `gpt-4o`                  | ✅             |
| `kimi`      | `https://api.moonshot.cn/v1`               | `moonshot-v1-8k`          | ✅             |
| `openrouter`| `https://openrouter.ai/api/v1`             | `gpt-4o`                  | ✅             |
| `gemini`    | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | ✅             |
| `ollama`    | `http://localhost:11434/v1`                | `llama3.2`                | ❌             |

### Switch providers

```bash
# Interactive
pulse provider -i

# In chat
/provider openrouter

# Or set in .env
PROVIDER=gemini
```

### Example configurations

**OpenAI:**
```ini
PROVIDER=openai
API_KEY=sk-...
MODEL=gpt-4o
```

**Kimi (Moonshot):**
```ini
PROVIDER=kimi
API_KEY=sk-...
MODEL=moonshot-v1-128k
```

**OpenRouter:**
```ini
PROVIDER=openrouter
API_KEY=sk-or-...
MODEL=anthropic/claude-3.5-sonnet
```

**Google Gemini:**
```ini
PROVIDER=gemini
API_KEY=AIza...
MODEL=gemini-2.0-flash
```

**Ollama (local):**
```ini
PROVIDER=ollama
MODEL=llama3.2
BASE_URL=http://localhost:11434/v1
```

**Any OpenAI-compatible provider:**
```ini
PROVIDER=openai
API_KEY=your-key
BASE_URL=https://api.together.xyz/v1
MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
```

## Usage

### Chat

```bash
pulse
```

```
  ╭────────────────────────────────────╮
  │  ♥ Pulse CLI  v1.0.0              │
  │  BYOK AI Coding Assistant          │
  │  Fast · Modular · Provider Agnostic│
  ╰────────────────────────────────────╯

  ▸ Provider:  openai
  ▸ Model:     gpt-4o
  ▸ Endpoint:  https://api.openai.com/v1

  Type /help for available commands.

╰─➤  write a fibonacci function in python
│  def fibonacci(n):
│      a, b = 0, 1
│      for _ in range(n):
│          yield a
│          a, b = b, a + b
│
╰─➤
```

### Multiline input

Just keep typing. An **empty line** (press Enter on a blank line) sends your message.
Lines are collected until you send them, making it easy to paste code or write
multi-line prompts.

### Slash commands

| Command            | Description                           |
|--------------------|---------------------------------------|
| `/help`            | Show available commands               |
| `/clear`           | Clear the terminal screen             |
| `/exit` or `/quit` | Exit Pulse CLI                        |
| `/history`         | Show recent messages in this session  |
| `/history --all`   | Show all messages in this session     |
| `/model <name>`    | Switch models                         |
| `/provider <name>` | Switch providers                      |
| `/new`             | Start a new conversation              |

### CLI commands

```bash
pulse                      Start interactive chat
pulse provider             List providers
pulse provider -i          Interactive provider switching
pulse configure            Run the setup wizard
pulse login                Quick API key setup
pulse history              List saved conversations
pulse history <id>         View a specific conversation
pulse history --delete <id> Delete a conversation
pulse --help               Show help
pulse --version            Show version
```

## Conversation Storage

Conversations are stored as individual JSON files in `~/.pulse/conversations/`.

- **Auto-save:** Each exchange is saved automatically.
- **Session resume:** Restart `pulse` and it picks up where you left off.
- **History:** View past conversations with `pulse history`.
- **Max 1000 messages** per conversation (oldest trimmed automatically).

## Roadmap

Pulse CLI is in active development. Here's what's planned:

### Phase 1 — Foundation ✅
- [x] Interactive chat with streaming responses
- [x] Multi-provider support (OpenAI, Kimi, OpenRouter, Gemini, Ollama)
- [x] Configuration wizard (`pulse configure`)
- [x] Conversation persistence and history
- [x] Slash commands and provider switching

### Phase 2 — Repository Awareness 🚧
- [ ] `pulse init` — Project initialisation with auto-detection
- [ ] `pulse map` — Repository structure mapping
- [ ] `pulse search` — Semantic code search
- [ ] `pulse remember` — Persistent project context and conventions

### Phase 3 — AI Workflows 🔄
- [ ] `pulse review` — AI-powered code review
- [ ] `pulse fix` — Automated bug fixing
- [ ] `pulse explain` — Code explanation
- [ ] `pulse optimize` — Performance optimisation
- [ ] `pulse document` — Documentation generation
- [ ] `pulse test` — Test generation
- [ ] `pulse release` — Release management

### Phase 4 — Health & Extensions 🔌
- [ ] `pulse doctor` — Project health diagnostics
- [ ] Plugin system (`pulse plugin install`)
- [ ] Git integration
- [ ] Local model optimisations
- [ ] Termux/mobile optimisations
- [ ] Battery-conscious mode

## Project Structure

```
pulse/
├── bin/
│   └── pulse.js              # CLI entry point
├── src/
│   ├── index.js              # Argument parsing & routing
│   ├── commands/             # Command implementations
│   │   ├── chat.js           # Interactive chat loop
│   │   ├── history.js        # Conversation history
│   │   ├── provider.js       # Provider management
│   │   ├── configure.js      # Setup wizard
│   │   └── future.js         # Placeholder commands
│   ├── lib/                  # Core infrastructure
│   │   ├── config.js         # Configuration loader
│   │   ├── errors.js         # Error handling
│   │   └── storage.js        # Conversation persistence
│   ├── providers/            # LLM providers
│   │   ├── base.js           # Abstract base class
│   │   ├── openai.js         # OpenAI-compatible
│   │   ├── kimi.js           # Moonshot/Kimi
│   │   ├── openrouter.js     # OpenRouter
│   │   ├── gemini.js         # Google Gemini
│   │   └── ollama.js         # Local Ollama
│   └── ui/                   # Terminal UI
│       ├── banner.js         # Welcome screen
│       ├── markdown.js       # Markdown renderer
│       └── spinner.js        # Loading spinner
├── .env.example              # Configuration template
├── package.json              # Dependencies & metadata
├── CONTRIBUTING.md           # Contribution guide
└── README.md                 # This file
```

## Adding a Provider

Pulse CLI's provider abstraction makes adding new providers straightforward.

### For OpenAI-compatible APIs

Just set `PROVIDER=openai` with the correct `BASE_URL` and `MODEL` — the
existing `OpenAIProvider` handles any API that follows the OpenAI
chat-completion schema.

### For custom providers

Create `src/providers/myprovider.js`:

```javascript
const BaseProvider = require('./base');

class MyProvider extends BaseProvider {
  get name() { return 'my-provider'; }

  async chatComplete(messages, signal) {
    // Return { content, usage }
  }

  async *streamChat(messages, signal) {
    // Yield content strings
  }
}

module.exports = MyProvider;
```

Then register in `src/providers/index.js`:
```javascript
const MyProvider = require('./myprovider');
REGISTRY['my-provider'] = MyProvider;
```

And add defaults in `src/lib/config.js`:
```javascript
'my-provider': {
  baseUrl: 'https://api.myprovider.com/v1',
  defaultModel: 'my-model',
},
```

That's it! Now available via `PROVIDER=my-provider`.

## Screenshots

> *Screenshots coming soon.*

```
┌──────────────────────────────────────────────┐
│  ♥ Pulse CLI  v1.0.0                        │
│  BYOK AI Coding Assistant                    │
│                                              │
│  ▸ Provider:  openai                         │
│  ▸ Model:     gpt-4o                         │
│  ▸ Endpoint:  https://api.openai.com/v1      │
│                                              │
│  Type /help for available commands.          │
└──────────────────────────────────────────────┘

╰─➤  explain the repository structure
│
│  Assistant [gpt-4o]
│  Here's how the project is organized:
│
│  pulse/
│  ├── bin/           # CLI entry point
│  ├── src/           
│  │   ├── commands/  # Chat, history, provider mgmt
│  │   ├── lib/       # Config, errors, storage
│  │   ├── providers/ # LLM provider implementations
│  │   └── ui/        # Terminal UI components
│  └── ...
```

## Requirements

- **Node.js ≥ 18** (native `fetch` support)
- A terminal with UTF-8 and true-color support (most modern terminals)
- An API key from at least one supported provider

## Development

```bash
# Setup
git clone https://github.com/pulse-cli/pulse.git
cd pulse
npm install
npm link

# Run
pulse

# Test
node -e "require('./src/index')"
```

## Design Philosophy

- **No vendor lock-in.** Your config, your key, your choice.
- **No data collection.** Zero telemetry, zero analytics.
- **Minimal dependencies.** Only what's essential. Easy to audit.
- **Terminal-native.** Streaming output, keyboard-friendly, fast startup.
- **Extensible.** Clean provider abstraction, plugin architecture planned.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <strong>Built with ♥ for developers who work in the terminal.</strong>
  <br>
  <br>
  <a href="https://github.com/pulse-cli/pulse">GitHub</a>
  ·
  <a href="https://github.com/pulse-cli/pulse/issues">Issues</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="https://github.com/pulse-cli/pulse/discussions">Discussions</a>
  <br>
  <br>
  <sub>Pulse CLI is an independent open-source project. Not affiliated with any AI provider.</sub>
</div>
