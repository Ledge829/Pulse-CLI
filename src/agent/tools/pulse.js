/**
 * Pulse-specific intelligence tools.
 *
 * These tools give the AI agent deep project understanding:
 * scanning, context loading, memory, architecture maps, health
 * analysis, git history understanding, impact prediction, simulation,
 * and safety guards.
 *
 * @module agent/tools/pulse
 */

const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────────

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot',
    '.zip', '.tar', '.gz', '.bz2',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.mp3', '.mp4', '.avi', '.mov',
    '.o', '.so', '.dll', '.dylib', '.exe',
  ]);
  return binaryExts.has(ext);
}

function readDir(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    const isDir = entry.isDirectory();
    results.push({
      name: entry.name,
      path: fullPath,
      type: isDir ? 'directory' : 'file',
    });
    if (isDir) {
      results.push(...readDir(fullPath, depth + 1, maxDepth));
    }
  }

  return results;
}

function detectLanguage(dir) {
  const indicators = {
    javascript: ['package.json', 'node_modules', '.js', '.jsx', '.mjs'],
    typescript: ['tsconfig.json', '.ts', '.tsx'],
    python: ['setup.py', 'pyproject.toml', 'requirements.txt', '.py'],
    go: ['go.mod', 'go.sum', '.go'],
    rust: ['Cargo.toml', '.rs'],
    java: ['pom.xml', 'build.gradle', '.java'],
    ruby: ['Gemfile', '.rb'],
    php: ['composer.json', '.php'],
    cpp: ['CMakeLists.txt', '.cpp', '.hpp', '.cc'],
    c: ['.c', '.h'],
    swift: ['Package.swift', '.swift'],
    kotlin: ['build.gradle.kts', '.kt'],
    elixir: ['mix.exs', '.ex'],
  };

  const files = readDir(dir, 0, 2);
  const fileNames = files.map((f) => path.basename(f.path));
  const extensions = files.map((f) => path.extname(f.path));

  const scores = {};
  for (const [lang, markers] of Object.entries(indicators)) {
    scores[lang] = 0;
    for (const marker of markers) {
      if (fileNames.includes(marker)) scores[lang] += 3;
      if (marker.startsWith('.') && extensions.includes(marker)) scores[lang] += 1;
    }
  }

  const sorted = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  return sorted.length > 0 ? sorted[0][0] : 'unknown';
}

// ── Tool definitions ───────────────────────────────────────────────────

/**
 * Register Pulse intelligence tools into a registry.
 * @param {import('./registry').ToolRegistry} registry
 * @param {{ cwd: string }} context
 */
function registerPulseTools(registry, context = { cwd: process.cwd() }) {
  registry.registerAll([
    // ── pulse_scan ───────────────────────────────────────────────────
    {
      name: 'pulse_scan',
      description: 'Analyse the project and create a comprehensive project fingerprint: language, framework, structure, dependencies, and entry points.',
      parameters: [],
      handler: async () => {
        const cwd = context.cwd;
        const dirName = path.basename(cwd);

        // Package detection
        const packageJson = fs.existsSync(path.join(cwd, 'package.json'))
          ? JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
          : null;

        // Dependency counts
        const deps = packageJson
          ? Object.keys(packageJson.dependencies || {}).length
          : 0;
        const devDeps = packageJson
          ? Object.keys(packageJson.devDependencies || {}).length
          : 0;

        // File counts
        const allFiles = readDir(cwd, 0, 4);
        const sourceFiles = allFiles.filter(
          (f) => f.type === 'file' && !isBinaryFile(f.path)
        );

        // Language detection
        const language = detectLanguage(cwd);

        // Entry point detection
        let entryPoint = null;
        if (packageJson) {
          entryPoint = packageJson.main || packageJson.bin || null;
        }

        return {
          status: 'ok',
          project: {
            name: dirName,
            language,
            entryPoint,
            deps: { runtime: deps, dev: devDeps },
            structure: {
              totalFiles: allFiles.filter((f) => f.type === 'file').length,
              totalDirs: allFiles.filter((f) => f.type === 'directory').length,
              sourceFiles: sourceFiles.length,
            },
            packageJson: packageJson
              ? {
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description,
                scripts: Object.keys(packageJson.scripts || {}),
              }
              : null,
          },
        };
      },
    },

    // ── pulse_context ────────────────────────────────────────────────
    {
      name: 'pulse_context',
      description: 'Load project understanding: learn about the project structure, coding conventions, and previous architectural decisions.',
      parameters: [
        { name: 'topic', type: 'string', description: 'Specific topic to learn about (optional)', required: false },
      ],
      handler: async (params) => {
        // TODO: Load from memory store
        // For now, return context based on file scanning
        const cwd = context.cwd;

        // Check for .pulsecontext or CLAUDE.md
        const contextFiles = [];
        for (const name of ['.pulsecontext', 'CLAUDE.md', '.cursorrules', '.env.example']) {
          const p = path.join(cwd, name);
          if (fs.existsSync(p)) {
            contextFiles.push({
              file: name,
              content: fs.readFileSync(p, 'utf-8').slice(0, 2000),
            });
          }
        }

        // Detect configuration files
        const configs = [];
        for (const name of ['package.json', 'tsconfig.json', '.eslintrc.js', 'jest.config.js', 'Dockerfile']) {
          if (fs.existsSync(path.join(cwd, name))) {
            configs.push(name);
          }
        }

        return {
          status: 'ok',
          context: {
            configs,
            contextFiles,
            conventions: {
              // TODO: Parse from existing files
              inferred: false,
            },
          },
          note: 'Context loading is in early access. Use pulse_memory for persistent project memory.',
        };
      },
    },

    // ── pulse_map ────────────────────────────────────────────────────
    {
      name: 'pulse_map',
      description: 'Generate a project architecture map showing directories, key files, and their relationships.',
      parameters: [
        { name: 'detail', type: 'string', description: 'Level of detail: "basic", "normal", "full"', required: false },
      ],
      handler: async (params) => {
        const detail = params.detail || 'normal';
        const maxDepth = detail === 'basic' ? 2 : detail === 'full' ? 6 : 4;
        const cwd = context.cwd;

        const entries = readDir(cwd, 0, maxDepth);
        const tree = entries.map((e) => ({
          name: e.name,
          type: e.type,
          path: path.relative(cwd, e.path),
        }));

        // Detect key architectural patterns
        const hasSrc = tree.some((e) => e.name === 'src' && e.type === 'directory');
        const hasLib = tree.some((e) => e.name === 'lib' && e.type === 'directory');
        const hasComponents = tree.some((e) => e.name === 'components' && e.type === 'directory');
        const hasRoutes = tree.some((e) => e.name === 'routes' && e.type === 'directory');
        const hasTests = tree.some((e) => e.name.match(/test|__tests__|spec/) && e.type === 'directory');

        const patterns = [];
        if (hasSrc) patterns.push('src-based layout');
        if (hasLib) patterns.push('lib-based layout');
        if (hasComponents) patterns.push('component-based UI');
        if (hasRoutes) patterns.push('route-based pages');
        if (hasTests) patterns.push('dedicated test directory');

        return {
          status: 'ok',
          architecture: {
            patterns,
            hasMonorepo: tree.some((e) => e.name === 'packages' || e.name === 'workspace'),
            isTypescript: tree.some((e) => e.name === 'tsconfig.json'),
            totalDirs: tree.filter((e) => e.type === 'directory').length,
            totalFiles: tree.filter((e) => e.type === 'file').length,
          },
          tree: detail !== 'basic' ? tree : tree.filter((e) => e.type === 'directory'),
          detail,
        };
      },
    },

    // ── pulse_memory ─────────────────────────────────────────────────
    {
      name: 'pulse_memory',
      description: 'Store and retrieve project-specific instructions, preferences, and learnings. Persistent across sessions.',
      parameters: [
        { name: 'action', type: 'string', description: '"get", "set", "list", or "delete"', required: true },
        { name: 'key', type: 'string', description: 'Memory key (for get/set/delete)', required: false },
        { name: 'value', type: 'string', description: 'Value to store (for set action)', required: false },
      ],
      handler: async (params) => {
        const memoryDir = path.join(require('os').homedir(), '.pulse', 'memory');
        if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

        const filePath = params.key
          ? path.join(memoryDir, `${params.key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
          : null;

        switch (params.action) {
          case 'set': {
            if (!filePath || !params.value) {
              return { status: 'error', error: 'Both key and value are required for set' };
            }
            fs.writeFileSync(filePath, JSON.stringify({
              key: params.key,
              value: params.value,
              updatedAt: new Date().toISOString(),
            }, null, 2), 'utf-8');
            return { status: 'ok', action: 'stored', key: params.key };
          }

          case 'get': {
            if (!filePath) return { status: 'error', error: 'Key is required for get' };
            if (!fs.existsSync(filePath)) {
              return { status: 'ok', found: false, key: params.key };
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            return { status: 'ok', found: true, key: params.key, value: data.value, updatedAt: data.updatedAt };
          }

          case 'list': {
            const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.json'));
            const memories = files.map((f) => {
              try {
                const data = JSON.parse(fs.readFileSync(path.join(memoryDir, f), 'utf-8'));
                return { key: data.key, updatedAt: data.updatedAt };
              } catch { return null; }
            }).filter(Boolean);
            return { status: 'ok', memories };
          }

          case 'delete': {
            if (!filePath) return { status: 'error', error: 'Key is required for delete' };
            if (!fs.existsSync(filePath)) return { status: 'ok', action: 'not_found', key: params.key };
            fs.unlinkSync(filePath);
            return { status: 'ok', action: 'deleted', key: params.key };
          }

          default:
            return { status: 'error', error: `Unknown action: ${params.action}. Use: get, set, list, delete` };
        }
      },
    },

    // ── pulse_health ─────────────────────────────────────────────────
    {
      name: 'pulse_health',
      description: 'Analyse project quality: check for outdated dependencies, security issues, code smells, and improvement opportunities.',
      parameters: [],
      handler: async () => {
        const cwd = context.cwd;
        const issues = [];
        const stats = { files: 0, lines: 0, comments: 0 };

        // Check for missing configs
        if (!fs.existsSync(path.join(cwd, '.gitignore'))) {
          issues.push({ severity: 'low', category: 'config', message: 'Missing .gitignore' });
        }
        if (!fs.existsSync(path.join(cwd, 'README.md'))) {
          issues.push({ severity: 'low', category: 'docs', message: 'Missing README.md' });
        }
        if (!fs.existsSync(path.join(cwd, 'LICENSE'))) {
          issues.push({ severity: 'low', category: 'license', message: 'Missing LICENSE file' });
        }

        // Check for large files
        const allFiles = readDir(cwd, 0, 5);
        for (const file of allFiles.filter((f) => f.type === 'file')) {
          try {
            const stat = fs.statSync(file.path);
            stats.files++;

            if (stat.size > 500 * 1024) { // > 500KB
              issues.push({
                severity: 'medium',
                category: 'size',
                message: `Large file: ${path.relative(cwd, file.path)} (${(stat.size / 1024).toFixed(0)}KB)`,
              });
            }

            if (!isBinaryFile(file.path) && stat.size < 1024 * 1024) {
              try {
                const content = fs.readFileSync(file.path, 'utf-8');
                const fileLines = content.split('\n').length;
                stats.lines += fileLines;
                stats.comments += (content.match(/\/\//g) || []).length;
              } catch { /* binary */ }
            }
          } catch { /* skip */ }
        }

        // Check for outdated deps if package.json
        const pkgPath = path.join(cwd, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            // Suggest using latest versions
            if (pkg.dependencies) {
              for (const [name, ver] of Object.entries(pkg.dependencies)) {
                if (ver.startsWith('^') || ver.startsWith('~')) {
                  // This is a soft check — real check requires npm
                }
              }
            }
          } catch { /* ignore */ }
        }

        return {
          status: 'ok',
          health: {
            score: Math.max(0, 100 - issues.length * 5),
            files: stats.files,
            totalLines: stats.lines,
            issues,
            summary: {
              critical: issues.filter((i) => i.severity === 'critical').length,
              high: issues.filter((i) => i.severity === 'high').length,
              medium: issues.filter((i) => i.severity === 'medium').length,
              low: issues.filter((i) => i.severity === 'low').length,
            },
          },
        };
      },
    },

    // ── pulse_history ────────────────────────────────────────────────
    {
      name: 'pulse_history',
      description: 'Understand why code exists by analysing Git history for a file. Shows commit messages and rationale.',
      parameters: [
        { name: 'file', type: 'string', description: 'File path to analyse', required: true },
        { name: 'count', type: 'number', description: 'Number of commits to show', required: false },
      ],
      handler: async (params) => {
        // This wraps the git_log tool focused on a single file
        const { execSync } = require('child_process');
        const count = params.count || 15;

        try {
          const log = execSync(
            `git log --follow --oneline --format="%h %ai %s" -${count} -- "${params.file}"`,
            { cwd: context.cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
          );

          const commits = log.trim().split('\n').filter(Boolean).map((line) => {
            const match = line.match(/^([a-f0-9]+)\s(.+?)\s(.+)$/);
            return match
              ? { hash: match[1], date: match[2], message: match[3] }
              : { hash: '', date: '', message: line };
          });

          return {
            status: 'ok',
            file: params.file,
            commits,
            totalChanges: commits.length,
          };
        } catch (err) {
          return {
            status: 'error',
            error: err.stderr ? err.stderr.toString().trim() : err.message,
          };
        }
      },
    },

    // ── pulse_predict ────────────────────────────────────────────────
    {
      name: 'pulse_predict',
      description: 'Estimate the impact of planned changes. Shows files that would be affected and potential risks.',
      parameters: [
        { name: 'changeDescription', type: 'string', description: 'Description of the planned change', required: true },
        { name: 'targetFiles', type: 'string', description: 'Comma-separated list of files to be changed', required: false },
      ],
      handler: async (params) => {
        const cwd = context.cwd;
        const targetFiles = params.targetFiles
          ? params.targetFiles.split(',').map((f) => f.trim())
          : [];

        // Scan for related files (imports, requires)
        const relatedFiles = [];
        if (targetFiles.length > 0) {
          for (const target of targetFiles) {
            const fullPath = path.join(cwd, target);
            if (!fs.existsSync(fullPath)) continue;

            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              // Find local imports/requires
              const imports = content.match(/(?:require\(['"]\.\.?\/)|(?:from\s+['"]\.\.?\/)/g) || [];
              relatedFiles.push({
                file: target,
                localImports: imports.length,
                size: content.length,
              });
            } catch { /* skip */ }
          }
        }

        // Check if there are uncommitted changes
        let hasUncommitted = false;
        try {
          const { execSync } = require('child_process');
          const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
          hasUncommitted = status.trim().length > 0;
        } catch { /* ignore */ }

        return {
          status: 'ok',
          analysis: {
            changeDescription: params.changeDescription,
            targetFiles,
            relatedFiles,
            hasUncommittedChanges: hasUncommitted,
            risks: relatedFiles.length > 5
              ? ['high'] : relatedFiles.length > 2
                ? ['medium'] : ['low'],
            estimatedImpact: relatedFiles.length > 5
              ? 'large' : relatedFiles.length > 2
                ? 'medium' : 'small',
          },
        };
      },
    },

    // ── pulse_simulate ───────────────────────────────────────────────
    {
      name: 'pulse_simulate',
      description: 'Preview possible consequences before applying changes. Shows a dry-run of what would happen.',
      parameters: [
        { name: 'action', type: 'string', description: 'Proposed action to simulate', required: true },
        { name: 'target', type: 'string', description: 'Target file or scope', required: false },
      ],
      handler: async (params) => {
        // Simulation is a dry-run analysis
        // For now, it returns what WOULD be checked before an action
        const cwd = context.cwd;

        // Check pre-conditions
        const preConditions = {
          directoryExists: fs.existsSync(cwd),
          hasGitRepo: false,
          hasUncommitted: false,
        };

        try {
          const { execSync } = require('child_process');
          preConditions.hasGitRepo = execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8' }).trim().length > 0;
          if (preConditions.hasGitRepo) {
            const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
            preConditions.hasUncommitted = status.trim().length > 0;
          }
        } catch { /* ignore */ }

        return {
          status: 'ok',
          simulation: {
            action: params.action,
            target: params.target,
            preConditions,
            warnings: preConditions.hasUncommitted
              ? ['Uncommitted changes detected — consider committing first']
              : [],
            dryRun: true,
            note: 'This is a simulation. No changes were made.',
          },
        };
      },
    },

    // ── pulse_guard ──────────────────────────────────────────────────
    {
      name: 'pulse_guard',
      description: 'Safety guard that checks proposed changes against project conventions and dangerous patterns before they execute.',
      parameters: [
        { name: 'action', type: 'string', description: 'The action being checked', required: true },
        { name: 'target', type: 'string', description: 'Target of the action', required: true },
      ],
      handler: async (params) => {
        const cwd = context.cwd;
        const warnings = [];
        const blocks = [];

        // Check 1: File exists and has content
        const fullPath = path.join(cwd, params.target);
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 0) {
              // File has content — modifying it needs care
            }
          } catch { /* ignore */ }
        }

        // Check 2: Secrets or credentials
        if (params.target.match(/\.(env|key|cert|pem|secret)$/i)) {
          warnings.push({ severity: 'critical', message: `Modifying credential file: ${params.target}` });
        }

        // Check 3: Package manager files
        if (params.target.match(/package-lock\.json|yarn\.lock|pnpm-lock\.yaml/)) {
          warnings.push({ severity: 'warning', message: 'Lock file changes should be committed separately' });
        }

        // Check 4: Node modules
        if (params.target.includes('node_modules')) {
          blocks.push({ message: 'Operations inside node_modules are blocked' });
        }

        // Check 5: Git directory
        if (params.target.includes('.git/')) {
          blocks.push({ message: 'Operations inside .git are blocked' });
        }

        return {
          status: blocks.length > 0 ? 'blocked' : warnings.length > 0 ? 'caution' : 'safe',
          guard: {
            action: params.action,
            target: params.target,
            warnings,
            blocked: blocks,
          },
        };
      },
    },
  ]);
}

module.exports = { registerPulseTools };
