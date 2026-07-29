/**
 * Terminal execution tools for the Pulse CLI agent.
 *
 * Allows the agent to run shell commands with safety restrictions.
 * Dangerous commands (rm, sudo, etc.) require user confirmation.
 *
 * @module agent/tools/term
 */

const { execSync } = require('child_process');

// ── Danger patterns ────────────────────────────────────────────────────

const DANGEROUS_COMMANDS = [
  /^rm\s+-rf/i,
  /^sudo/i,
  /^dd\s+/i,
  /^mkfs/i,
  /^:(){ :\|:& };:/, // Fork bomb
  /^chmod\s+777/i,
  /^chown/i,
  /^>/,
  /^\|/,
  /^kill\s+-9/i,
  /^shutdown/i,
  /^reboot/i,
  /^init\s+/i,
  /^systemctl/i,
];

function isDangerous(command) {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command.trim()));
}

// ── Tool registration ──────────────────────────────────────────────────

/**
 * Register terminal execution tools into a registry.
 * @param {import('./registry').ToolRegistry} registry
 * @param {{ cwd: string }} context
 */
function registerTermTools(registry, context = { cwd: process.cwd() }) {
  registry.registerAll([
    // ── terminal_run ─────────────────────────────────────────────────
    {
      name: 'terminal_run',
      description: 'Run a shell command and return its output. Useful for builds, tests, and quick scripts.',
      parameters: [
        { name: 'command', type: 'string', description: 'Shell command to execute', required: true },
        { name: 'description', type: 'string', description: 'What this command does', required: false },
        { name: 'timeout', type: 'number', description: 'Timeout in milliseconds (default 30000)', required: false },
      ],
      dangerous: false, // We'll check dynamically based on command
      handler: async (params) => {
        const cmd = params.command.trim();

        // Dynamic danger check
        if (isDangerous(cmd)) {
          return {
            status: 'blocked',
            reason: 'Command was blocked by Pulse Guard for safety',
            command: cmd,
            suggestion: 'Use safer alternatives or run manually with `! ` prefix',
          };
        }

        const timeout = params.timeout || 30_000;

        try {
          const stdout = execSync(cmd, {
            cwd: context.cwd,
            encoding: 'utf-8',
            maxBuffer: 5 * 1024 * 1024,
            timeout,
            env: { ...process.env, PULSE_AGENT: '1' },
          });
          return {
            status: 'ok',
            command: cmd,
            stdout: stdout.trim(),
            exitCode: 0,
          };
        } catch (err) {
          return {
            status: err.status === null ? 'timeout' : 'error',
            command: cmd,
            stdout: (err.stdout || '').toString().trim(),
            stderr: (err.stderr || '').toString().trim(),
            exitCode: err.status || -1,
          };
        }
      },
    },

    // ── terminal_test ────────────────────────────────────────────────
    {
      name: 'terminal_test',
      description: 'Run project tests. Auto-detects the test framework (jest, mocha, pytest, etc.).',
      parameters: [
        { name: 'framework', type: 'string', description: 'Test framework (auto-detected if not specified)', required: false },
        { name: 'file', type: 'string', description: 'Specific test file to run', required: false },
      ],
      handler: async (params) => {
        const cwd = context.cwd;

        // Auto-detect test framework
        const detectors = [
          { name: 'jest', cmd: 'npx jest --no-coverage', config: 'jest.config.js' },
          { name: 'mocha', cmd: 'npx mocha', config: '.mocharc.js' },
          { name: 'vitest', cmd: 'npx vitest run', config: 'vitest.config.js' },
          { name: 'pytest', cmd: 'python -m pytest', config: 'pytest.ini' },
        ];

        let cmd = params.framework
          ? `npx ${params.framework}`
          : null;

        if (!cmd) {
          const fs = require('fs');
          for (const det of detectors) {
            if (fs.existsSync(require('path').join(cwd, det.config))) {
              cmd = det.cmd;
              break;
            }
          }
          if (!cmd) cmd = 'npm test';
        }

        if (params.file) cmd += ` ${params.file}`;

        try {
          const stdout = execSync(cmd, {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 5 * 1024 * 1024,
            timeout: 120_000,
          });
          return {
            status: 'ok',
            command: cmd,
            output: stdout.trim(),
            exitCode: 0,
          };
        } catch (err) {
          return {
            status: 'failed',
            command: cmd,
            output: (err.stdout || '').toString().trim(),
            errors: (err.stderr || '').toString().trim(),
            exitCode: err.status || -1,
          };
        }
      },
    },
  ]);
}

module.exports = { registerTermTools };
