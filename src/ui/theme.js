/**
 * Pulse CLI — Design System / Theme
 *
 * Single source of truth for all visual tokens.
 * Every component imports from here — no magic strings elsewhere.
 *
 * @module ui/theme
 */

const theme = {
  // ── Brand colours ──────────────────────────────────────────────────
  cyan:    'cyan',
  magenta: 'magenta',
  green:   'green',
  yellow:  'yellow',
  red:     'red',
  white:   'white',
  gray:    'gray',

  // ── Role-specific colours ───────────────────────────────────────────
  userColor:      'green',
  assistantColor: 'cyan',
  systemColor:    'yellow',
  toolColor:      'gray',
  errorColor:     'red',

  // ── Border styles ───────────────────────────────────────────────────
  borderStyle:       'single',
  inputBorderColor:  'cyan',
  headerBorderColor: 'cyan',

  // ── Layout constants ────────────────────────────────────────────────
  // Header: 3 lines (border top + 1 content line + border bottom)
  // Status bar: 1 line (no border, inline)
  // Input: 3 lines (border top + 1 content line + border bottom)
  // Chat pane: everything in between (flexGrow: 1)

  // ── Symbols ─────────────────────────────────────────────────────────
  logo:            '♡ Pulse',
  userBadge:       'you',
  assistantBadge:  'pulse',
  toolBadge:       'tool',
  errorBadge:      'error',
  inputPrompt:     '›',
  thinkingFrames:  ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

module.exports = theme;
