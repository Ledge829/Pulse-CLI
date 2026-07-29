#!/usr/bin/env node

/**
 * Pulse CLI — fast, provider-agnostic AI coding assistant.
 *
 * This is the entry point invoked by the `pulse` command.
 * Hands control to src/index.js for argument parsing and routing.
 *
 * @package pulse-cli
 */

process.title = 'pulse';

require('../src/index').main().catch((err) => {
  console.error('\n  ✖ Fatal error:', err.message);
  process.exit(1);
});
