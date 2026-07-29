/**
 * Lightweight markdown-to-terminal renderer for Pulse CLI.
 *
 * Handles: headers, bold, italic, inline code, code blocks,
 * lists, blockquotes, horizontal rules, and links.
 *
 * @module ui/markdown
 */

const chalk = require('chalk');

function terminalWidth() {
  return process.stdout.columns || 80;
}

function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'empty', depth: 0, content: '' };
  if (/^```/.test(trimmed)) {
    const lang = trimmed.replace(/^```/, '').trim();
    return { type: 'code_fence_open', depth: 0, content: lang };
  }
  const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
  if (headerMatch) {
    return { type: 'header', depth: headerMatch[1].length, content: headerMatch[2] };
  }
  if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(trimmed)) {
    return { type: 'hr', depth: 0, content: '' };
  }
  if (/^(\s*)[-*+]\s+(.+)/.test(trimmed)) {
    const [, indent, content] = trimmed.match(/^(\s*)[-*+]\s+(.+)/);
    return { type: 'ulist', depth: Math.floor(indent.length / 2), content };
  }
  if (/^(\s*)\d+[.)]\s+(.+)/.test(trimmed)) {
    const [, indent, content] = trimmed.match(/^(\s*)\d+[.)]\s+(.+)/);
    return { type: 'olist', depth: Math.floor(indent.length / 2), content };
  }
  if (trimmed.startsWith('> ')) {
    return { type: 'blockquote', depth: 0, content: trimmed.slice(2) };
  }
  return { type: 'text', depth: 0, content: trimmed };
}

function renderInline(text) {
  let result = text.replace(/`([^`]+)`/g, (_, code) => chalk.inverse(code));
  result = result.replace(/~~(.+?)~~/g, (_, t) => chalk.strikethrough(t));
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t));
  result = result.replace(/__(.+?)__/g, (_, t) => chalk.bold(t));
  result = result.replace(/\*(.+?)\*/g, (_, t) => chalk.italic(t));
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, (_, t) => chalk.italic(t));
  result = result.replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => chalk.underline.blue(text));
  return result;
}

function renderCodeBlock(lang, code) {
  const lines = [];
  const width = terminalWidth();
  if (lang) {
    lines.push(chalk.dim(`  ── ${lang} ──`));
  } else {
    lines.push(chalk.dim('  ── code ──'));
  }
  for (const line of code.split('\n')) {
    lines.push(`  ${chalk.cyan(line)}`);
  }
  lines.push(chalk.dim(`  ${'─'.repeat(Math.min(20, width - 4))}`));
  return lines.join('\n');
}

function renderMarkdown(markdown) {
  if (!markdown) return '';
  const width = terminalWidth();
  const rawLines = markdown.split('\n');
  const output = [];
  let codeBlock = null;

  for (const rawLine of rawLines) {
    const line = rawLine;
    if (codeBlock) {
      if (/^```/.test(line.trim())) {
        output.push(renderCodeBlock(codeBlock.lang, codeBlock.lines.join('\n')));
        codeBlock = null;
        continue;
      }
      codeBlock.lines.push(line);
      continue;
    }
    if (/^```/.test(line.trim())) {
      const lang = line.trim().replace(/^```/, '').trim();
      codeBlock = { lang, lines: [] };
      continue;
    }

    const cls = classifyLine(line);
    switch (cls.type) {
      case 'empty':
        output.push('');
        break;
      case 'header': {
        const color = cls.depth === 1 ? chalk.bold.cyan
          : cls.depth === 2 ? chalk.bold.blue
            : chalk.bold;
        output.push(`  ${color('#' + ' '.repeat(cls.depth) + cls.content)}`);
        break;
      }
      case 'hr':
        output.push(chalk.dim('  ' + '─'.repeat(Math.min(width - 4, 40))));
        break;
      case 'ulist': {
        const indent = '  '.repeat(cls.depth);
        output.push(`  ${indent}${chalk.cyan('●')} ${renderInline(cls.content)}`);
        break;
      }
      case 'olist': {
        const numMatch = line.trim().match(/^(\d+)[.)]/);
        const num = numMatch ? numMatch[1] : '1';
        const indent = '  '.repeat(cls.depth);
        output.push(`  ${indent}${chalk.dim(num + '.')} ${renderInline(cls.content)}`);
        break;
      }
      case 'blockquote':
        output.push(`  ${chalk.dim('│')} ${chalk.italic(cls.content)}`);
        break;
      case 'text':
      default: {
        const wrapped = wrapText(renderInline(cls.content), width - 4);
        output.push(`  ${wrapped}`);
        break;
      }
    }
  }

  if (codeBlock) {
    output.push(renderCodeBlock(codeBlock.lang, codeBlock.lines.join('\n')));
  }

  return output.join('\n');
}

function wrapText(text, width) {
  if (width <= 0 || text.length === 0) return text;
  const lines = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    let current = '';
    let currentLen = 0;
    const words = para.split(/(\s+)/);
    for (const word of words) {
      const wordLen = stripAnsi(word).length;
      if (currentLen + wordLen > width && currentLen > 0) {
        lines.push(current.trimEnd());
        current = '';
        currentLen = 0;
      }
      current += word;
      currentLen += wordLen;
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines.join('\n  ');
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

module.exports = { renderMarkdown, renderInline, renderCodeBlock };
