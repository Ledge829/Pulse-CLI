# Pulse CLI: Architecture Analysis & Transformation Plan

## Current State Assessment

### Project Structure
```
pulse-cli/                 2,563 lines across 18 source files
├── bin/pulse.js           (17 lines) — trivial entry point
├── src/
│   ├── index.js           (189 lines) — routing + help text
│   ├── commands/          (960 lines)
│   │   ├── chat.js        (377 lines) — main interactive loop
│   │   ├── configure.js   (205 lines) — setup wizard
│   │   ├── future.js      (153 lines) — 12 placeholder stubs
│   │   ├── history.js     (101 lines) — conversation CRUD
│   │   └── provider.js    (124 lines) — list/switch
│   ├── lib/               (494 lines)
│   │   ├── config.js      (165 lines) — .env loader
│   │   ├── errors.js      (131 lines) — typed errors
│   │   └── storage.js     (198 lines) — JSON persistence
│   ├── providers/         (645 lines)
│   │   ├── base.js        (41 lines) — abstract class
│   │   ├── openai.js      (194 lines) — SSE streaming
│   │   ├── kimi.js        (25 lines) — extends OpenAI
│   │   ├── openrouter.js  (23 lines) — extends OpenAI
│   │   ├── gemini.js      (234 lines) — full custom impl
│   │   ├── ollama.js      (58 lines) — extends OpenAI
│   │   └── index.js       (70 lines) — registry/factory
│   └── ui/                (258 lines)
│       ├── banner.js      (42 lines) — welcome screen
│       ├── markdown.js    (168 lines) — inline renderer
│       └── spinner.js     (48 lines) — ora wrapper
├── conversations/         (empty — runtime data)
├── .env.example           (template)
└── package.json           (3 deps: chalk, ora, dotenv)
```

### What Works Well
- **Clean module boundaries** — `lib/`, `providers/`, `ui/`, `commands/` separation
- **Provider abstraction** — BaseProvider with 5 real implementations
- **SSE streaming** — properly implemented in openai.js with buffer management
- **Error hierarchy** — PulseError → 5 concrete types with code-based hints
- **Atomic writes** — tmp+rename for conversation files
- **SIGINT handling** — cancels in-flight streams vs graceful exit
- **Config priority** — .env files → env vars → overrides

### Critical Gaps & Missing Pieces

#### 1. Branding & UX
- Banner is plain (no ASCII art, no character)
- No loading states beyond spinner (no progress bars, no step indicators)
- No first-run detection or onboarding flow
- No Termux-specific optimizations (keyboard, display, battery)
- Error messages inconsistent between modules

#### 2. Provider System Weaknesses
- Provider list is hardcoded in `config.js` — not extensible at runtime
- No `provider add/remove/test` commands
- No router/fallback concept
- No connection testing
- Config only supports single active provider (no multi-provider config store)

#### 3. Missing Agent/Tool Architecture
- Chat loop sends raw user text to LLM — no tool use capability
- No file system tools (read, write, search, diff)
- No Git awareness
- No project context/understanding
- No structured output parsing
- No tool call / function calling support in providers

#### 4. Missing Workflow Commands
- `pulse plan`, `pulse build`, `pulse review`, `pulse doctor`, `pulse ship` are not implemented
- Future.js has 12 stubs returning "coming soon" — no actual functionality
- No workflow orchestration logic

#### 5. Plugin/Skills Architecture
- No plugin system at all
- No skill loading
- No extension points in the codebase

#### 6. MCP Support
- No MCP client architecture
- No concept of external tool/data source connections

#### 7. npm Publishing
- Missing: `repository` field in package.json
- Missing: `bugs` and `homepage` URLs
- Missing: `files` whitelist
- Missing: `prepublish` script
- Missing: `author` field

#### 8. Package.json gaps
- Missing `homepage`, `bugs`, `repository` structured fields
- Missing `files` array for publish whitelist
- Just 3 deps (good) but could be more efficient startup
- No `engines` enforcement beyond `>=18`

---

## Transformation Plan

### Stage 1: Core Polish & Branding (no new features)
Files to modify: banner.js, index.js, configure.js, package.json, README.md

1. **Package.json** — add repository, bugs, homepage, files whitelist, author
2. **Bin entry** — add Node.js version check, fast startup guard
3. **Banner** — professional Pulse CLI identity with pulse character
4. **Help text** — consistent formatting, grouped commands, examples
5. **First-run detection** — check ~/.pulse/config.json existence, show onboarding
6. **Error output** — consistent iconography and formatting

### Stage 2: Provider System Overhaul
Files to modify: config.js, provider.js, configure.js, providers/index.js
Files to create: commands/provider-add.js, commands/provider-test.js

1. **Config as JSON** — migrate from pure .env to ~/.pulse/config.json with .env override
2. **Multi-provider store** — store multiple provider configs, active selection
3. **`pulse provider add`** — interactive provider addition
4. **`pulse provider remove`** — remove stored provider
5. **`pulse provider test`** — connection test with spinner + result
6. **`pulse provider list`** — detailed table with status indicators
7. **Router concept** — optional routing config for fallback providers
8. **Provider metadata** — capabilities, models, context window info

### Stage 3: Onboarding Experience
Files to modify: configure.js, index.js
Files to create: commands/onboarding.js, lib/firstrun.js

1. **First-run detection** — detect first launch, guide through setup
2. **Onboarding wizard** — provider selection → API key → model → test → done
3. **BYOK explanation** — clear explanation of BYOK model during onboarding
4. **Quick start tips** — show /help, key commands after setup

### Stage 4: Agent/Tool Architecture
Files to create: agent/index.js, agent/tools/*.js, agent/workflows/*.js

1. **Tool registry** — centralized tool registration and dispatch
2. **Core tools** — file_read, file_write, code_search, terminal_run, git_log, git_diff
3. **Pulse-specific tools** — pulse_scan, pulse_context, pulse_map, pulse_memory, pulse_health, pulse_history, pulse_predict, pulse_simulate, pulse_guard
4. **Structured output parsing** — parse XML tool calls from LLM responses
5. **Tool execution** — safe sandboxed execution, confirmation flow

### Stage 5: Workflow Commands
Files to create: commands/plan.js, commands/build.js, commands/review.js, commands/doctor.js, commands/ship.js

1. **`pulse plan`** — analyze request → explore → create implementation plan
2. **`pulse build`** — implement with file tree display + confirmation
3. **`pulse review`** — analyze code quality, bugs, security, architecture
4. **`pulse doctor`** — diagnose system, provider, project issues
5. **`pulse ship`** — prepare release: changelog, version, commit, tag

### Stage 6: Plugin & Skills Architecture
Files to create: plugins/index.js, plugins/registry.js, skills/index.js, commands/plugin.js

1. **Plugin registry** — load plugins from ~/.pulse/plugins/
2. **Plugin interface** — standard plugin structure (name, hooks, tools)
3. **Skills system** — skills add domain knowledge + custom prompts
4. **`pulse plugin install/search/list/remove`**

### Stage 7: MCP Architecture Blueprint
Files to create: docs/mcp-architecture.md, lib/mcp-client.js (stub)

1. **MCP client interface** — connection, tool listing, tool call
2. **MCP transport abstraction** — stdio, SSE, WebSocket
3. **Integration with tool system** — MCP tools appear in agent tool registry
4. **Documentation** — MCP architecture plan

### Stage 8: npm Publishing Prep
Files to modify: package.json, .npmignore

1. **package.json audit** — name, version, description, keywords, repository, bugs, homepage, files, main, types
2. **`npm pack` test** — verify tarball contents
3. **`npm install -g` test** — verify global install
4. **Publishing guide** — documentation for maintainers

---

## Roadmap Alignment

| v0.1 (Current) | v0.2 (This PR) | v0.3 | v0.4 | v1.0 |
|---|---|---|---|---|
| Chat + streaming | Onboarding | Plugin system | MCP client | Production |
| 5 providers | Provider management | Skills | External tools | Ecosystem |
| Basic config | Agent tools | Community plugins | Database | Stable API |
| History | Workflows | Extensions | CI/CD | Docs |
| Slash commands | Pulse-specific tools | Integrations | Deploy | Testing |

---

## Files to Create (new)

```
src/agent/
├── index.js          — Tool registry + dispatcher
├── tools/
│   ├── fs.js         — file_read, file_write, code_search
│   ├── git.js        — git_log, git_diff, git_status
│   ├── pulse.js      — pulse_scan, pulse_context, pulse_map, pulse_memory
│   └── term.js       — terminal execution
└── workflows/
    ├── plan.js       — analysis → exploration → plan
    ├── build.js      — implementation with safeguards
    ├── review.js     — code review pipeline
    ├── doctor.js     — diagnostics
    └── ship.js       — release pipeline

src/commands/
├── onboarding.js    — First-run wizard
├── plan.js          — pulse plan (wraps workflow)
├── build.js         — pulse build
├── review.js        — pulse review
├── doctor.js        — pulse doctor
├── ship.js          — pulse ship
└── plugin.js        — pulse plugin install/search/list/remove

src/plugins/
└── index.js         — Plugin/skill registry

src/lib/
├── config-store.js  — JSON config manager for ~/.pulse/*.json
└── firstrun.js      — First-run detection + onboarding trigger

docs/
└── mcp-architecture.md
```

## Files to Modify

| File | Change |
|---|---|
| package.json | Add repository, bugs, homepage, files, author, scripts |
| src/index.js | Add new commands, improve help, first-run check |
| src/lib/config.js | Add multi-provider support, JSON config store |
| src/commands/chat.js | Agent integration, tool dispatch |
| src/commands/configure.js | Streamlined, first-run aware |
| src/commands/provider.js | Full add/remove/test/list |
| src/commands/future.js | Remove stubs (replaced by real commands) |
| src/ui/banner.js | Professional branding |
| src/providers/index.js | Dynamic registration |
| bin/pulse.js | Version check, startup optimization |
| README.md | Comprehensive rewrite |
