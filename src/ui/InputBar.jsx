/**
 * InputBar — user text input area
 *
 * Design decisions:
 * - Single bordered row at the bottom of the screen
 * - Left prefix shows prompt symbol (›) in cyan
 * - Right shows typed text + blinking cursor block when active
 * - When isThinking, the prompt dims and shows "waiting…" — no input accepted
 * - Input captured entirely via Ink's useInput hook (no ink-text-input dep)
 * - Cursor is simulated with a blinking █ character (interval timer)
 * - Ctrl+U clears the line (standard terminal behaviour)
 * - Ctrl+W deletes last word (standard terminal behaviour)
 * - flexShrink: 0 ensures the bar never collapses
 *
 * @module ui/InputBar
 */

'use strict';
const React = require('react');
const { Box, Text, useInput } = require('ink');
const theme = require('./theme');

const CURSOR = '█';

const InputBar = ({ onSubmit, isThinking }) => {
  const [text, setText]           = React.useState('');
  const [cursorOn, setCursorOn]   = React.useState(true);

  // ── Blinking cursor ────────────────────────────────────────────────
  React.useEffect(() => {
    if (isThinking) { setCursorOn(false); return; }
    const id = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(id);
  }, [isThinking]);

  // ── Keyboard handler ───────────────────────────────────────────────
  useInput((input, key) => {
    if (isThinking) return;

    // Submit
    if (key.return) {
      const trimmed = text.trim();
      if (trimmed) { onSubmit(trimmed); setText(''); }
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setText(prev => prev.slice(0, -1));
      return;
    }

    // Ctrl+U — clear line
    if (key.ctrl && input === 'u') {
      setText('');
      return;
    }

    // Ctrl+W — delete last word
    if (key.ctrl && input === 'w') {
      setText(prev => prev.replace(/\S+\s*$/, ''));
      return;
    }

    // Printable character
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setText(prev => prev + input);
    }
  });

  const cursor = isThinking ? '' : (cursorOn ? CURSOR : ' ');

  return React.createElement(
    Box,
    {
      borderStyle:  'single',
      borderColor:  isThinking ? theme.gray : theme.inputBorderColor,
      paddingX:     1,
      flexDirection: 'row',
      flexShrink:   0,
    },

    // Prompt glyph
    React.createElement(
      Text,
      { color: isThinking ? theme.gray : theme.cyan, bold: !isThinking },
      `${theme.inputPrompt} `
    ),

    // Text content + cursor
    React.createElement(
      Box,
      { flexGrow: 1 },
      isThinking
        ? React.createElement(Text, { color: theme.gray, dimColor: true }, 'Waiting for response…')
        : React.createElement(
            Text,
            { color: theme.white, wrap: 'wrap' },
            text + cursor
          )
    ),
  );
};

module.exports = InputBar;
