/**
 * Git integration tools for the Pulse CLI agent.
 *
 * Provides read-only Git awareness: log, diff, status, blame.
 * Write operations (commit, branch, etc.) require explicit user confirmation.
 *
 * @module agent/tools/git
 */

const { execSync } = require('child_process');

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Run a git command and return the output.
 * @param {string} args
 * @param {string} cwd
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function git(args, cwd) {
  try {
    const stdout = execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
      exitCode: err.status || 1,
    };
  }
}

/**
 * Check if the current directory is a git repository.
 * @param {string} cwd
 * @returns {boolean}
 */
function isRepo(cwd) {
  const result = git('rev-parse --git-dir', cwd);
  return result.exitCode === 0;
}

// ── Tool definitions ───────────────────────────────────────────────────

/**
 * Register Git tools into a registry.
 * @param {import('./registry').ToolRegistry} registry
 * @param {{ cwd: string }} context
 */
function registerGitTools(registry, context = { cwd: process.cwd() }) {
  registry.registerAll([
    // ── git_log ──────────────────────────────────────────────────────
    {
      name: 'git_log',
      description: 'View commit history. Shows recent commits with hash, author, date, and message.',
      parameters: [
        { name: 'count', type: 'number', description: 'Number of commits to show (default 10)', required: false },
        { name: 'file', type: 'string', description: 'Filter log to a specific file path', required: false },
        { name: 'branch', type: 'string', description: 'Branch name (default: current)', required: false },
      ],
      handler: async (params) => {
        if (!isRepo(context.cwd)) {
          return { status: 'error', error: 'Not a git repository' };
        }

        const count = params.count || 10;
        let args = `log --oneline -${count} --decorate`;
        if (params.file) args += ` -- "${params.file}"`;
        if (params.branch) args = `log --oneline -${count} --decorate ${params.branch}`;

        const result = git(args, context.cwd);
        if (result.exitCode !== 0) {
          return { status: 'error', error: result.stderr };
        }

        // Parse into structured data
        const commits = result.stdout.split('\n').filter(Boolean).map((line) => {
          const match = line.match(/^([a-f0-9]+)\s(.+)$/);
          return match ? { hash: match[1], message: match[2] } : { hash: '', message: line };
        });

        // Get detailed log
        const detailArgs = `log -${count} --format="%H|%an|%ai|%s"`;
        if (params.file) detailArgs += ` -- "${params.file}"`;
        const detailResult = git(detailArgs, context.cwd);
        const details = detailResult.stdout.split('\n').filter(Boolean).map((line) => {
          const [hash, author, date, ...msgParts] = line.split('|');
          return { hash, author, date, message: msgParts.join('|') };
        });

        return {
          status: 'ok',
          isRepo: true,
          commits: details.length ? details : commits,
          totalCommits: commits.length,
        };
      },
    },

    // ── git_diff ────────────────────────────────────────────────────
    {
      name: 'git_diff',
      description: 'Show uncommitted changes or diff between commits. Shows a readable diff preview.',
      parameters: [
        { name: 'path', type: 'string', description: 'Specific file path to diff', required: false },
        { name: 'staged', type: 'boolean', description: 'Show staged changes only', required: false },
        { name: 'base', type: 'string', description: 'Base ref for comparison (e.g. "main")', required: false },
        { name: 'target', type: 'string', description: 'Target ref (default: HEAD)', required: false },
      ],
      handler: async (params) => {
        if (!isRepo(context.cwd)) {
          return { status: 'error', error: 'Not a git repository' };
        }

        let args = 'diff';
        if (params.staged) args += ' --cached';
        if (params.base) {
          args += ` ${params.base}`;
          if (params.target) args += ` ${params.target}`;
        }
        if (params.path) args += ` -- "${params.path}"`;

        const result = git(args, context.cwd);
        if (result.exitCode !== 0 && result.stderr) {
          return { status: 'error', error: result.stderr };
        }

        const diff = result.stdout;
        const filesChanged = diff ? (diff.match(/^diff --git/g) || []).length : 0;

        // Count added/removed lines
        const added = (diff.match(/^\+/gm) || []).length;
        const removed = (diff.match(/^-/gm) || []).length;

        return {
          status: 'ok',
          isRepo: true,
          diff: diff || '(no changes)',
          filesChanged,
          linesAdded: added,
          linesRemoved: removed,
        };
      },
    },

    // ── git_status ──────────────────────────────────────────────────
    {
      name: 'git_status',
      description: 'Show the working tree status. Lists modified, staged, and untracked files.',
      parameters: [],
      handler: async () => {
        if (!isRepo(context.cwd)) {
          return { status: 'error', error: 'Not a git repository' };
        }

        const result = git('status --short', context.cwd);
        const branchResult = git('rev-parse --abbrev-ref HEAD', context.cwd);

        const files = result.stdout.split('\n').filter(Boolean).map((line) => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(3),
        }));

        return {
          status: 'ok',
          isRepo: true,
          branch: branchResult.stdout || 'unknown',
          files,
          total: files.length,
          modified: files.filter((f) => f.status === 'M' || f.status === ' M').length,
          staged: files.filter((f) => f.status.startsWith('M')).length,
          untracked: files.filter((f) => f.status === '??').length,
        };
      },
    },

    // ── git_blame ───────────────────────────────────────────────────
    {
      name: 'git_blame',
      description: 'Show who last modified each line of a file. Useful for understanding code history.',
      parameters: [
        { name: 'file', type: 'string', description: 'File path to blame', required: true },
        { name: 'lines', type: 'string', description: 'Line range to show (e.g. "10-20")', required: false },
      ],
      handler: async (params) => {
        if (!isRepo(context.cwd)) {
          return { status: 'error', error: 'Not a git repository' };
        }

        let args = `blame --line-porcelain "${params.file}"`;
        if (params.lines) args += ` -L ${params.lines}`;

        const result = git(args, context.cwd);
        if (result.exitCode !== 0) {
          return { status: 'error', error: result.stderr || 'Could not blame file' };
        }

        // Parse porcelain output into structured data
        const lines = [];
        const currentBlocks = result.stdout.split('\n');

        // Build a simpler view
        const shortArgs = `blame --short "${params.file}"`;
        if (params.lines) shortArgs += ` -L ${params.lines}`;
        const shortResult = git(shortArgs, context.cwd);

        return {
          status: 'ok',
          isRepo: true,
          file: params.file,
          blame: shortResult.stdout || result.stdout,
        };
      },
    },
  ]);
}

module.exports = { registerGitTools };
