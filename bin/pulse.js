#!/usr/bin/env node

/**
 * Pulse CLI — fast, provider-agnostic AI coding assistant.
 *
 * Entry point invoked by the `pulse` command.
 * Performs startup checks then delegates to src/index.js.
 *
 * @package pulse-cli
 */

// ── Node.js version gate ───────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('\n  ✖ Pulse CLI requires Node.js ≥ 18');
  console.error(`    Current: Node.js ${process.versions.node}`);
  console.error('    Upgrade: https://nodejs.org\n');
  process.exit(1);
}

process.title = 'pulse';

// ── Fast path: --version or -v (no module load needed) ─────────────────
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  // eslint-disable-next-line global-require
  const pkg = require('../package.json');
  console.log(`pulse-cli v${pkg.version}`);
  process.exit(0);
}

// ── Boot ───────────────────────────────────────────────────────────────
require('../src/index').main().catch((err) => {
  console.error('\n  ✖ Fatal error:', err.message);
  process.exit(1);
});
