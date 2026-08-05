/**
 * ChatPane — scrollable message list
 *
 * Ink v3 does not support true overflow scrolling. The standard pattern
 * used by serious Ink apps (e.g. Charm's Bubble Tea ports) is to keep a
 * "viewport window" — we only render the last N messages that fit.
 *
 * Architecture:
 * - ChatPane receives the full message array from App state
 * - It slices off the tail (most recent messages) to fill the pane
 * - The slice limit is derived from the available terminal height minus
 *   fixed UI chrome (header 3 + status 1 + input 3 = 7 lines)
 * - A "scroll up for more" hint is shown when history is clipped
 * - ThinkingRow is shown at the bottom when isThinking === true
 * - Empty state is shown when there are no messages yet
 *
 * Design decisions:
 * - No border on the chat pane itself — borders on every panel causes
 *   the nested-box rendering bugs seen in v1.  Only the input has a border.
 * - paddingX: 2 gives breathing room from terminal edges
 * - overflowY: 'hidden' prevents Ink from trying to paint past the box
 *
 * @module ui/ChatPane
 */

'use strict';
const React       = require('react');
const { Box, Text, useStdout } = require('ink');
const MessageBubble = require('./MessageBubble');
const theme         = require('./theme');

// Spinner frames for the thinking indicator
const FRAMES = theme.thinkingFrames;

/** Animated "thinking" row shown below the last message */
const ThinkingRow = () => {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return React.createElement(
    Box,
    { flexDirection: 'row', gap: 1, marginTop: 1, flexShrink: 0 },
    React.createElement(Text, { color: theme.cyan }, FRAMES[frame]),
    React.createElement(Text, { color: theme.cyan, bold: true }, theme.assistantBadge),
    React.createElement(Text, { color: theme.gray }, 'is thinking…'),
  );
};

/** Empty state — shown when there are zero messages */
const EmptyState = () =>
  React.createElement(
    Box,
    {
      flexGrow:        1,
      flexDirection:   'column',
      justifyContent:  'center',
      alignItems:      'center',
      paddingY:        2,
    },
    React.createElement(Text, { color: theme.cyan, bold: true }, '♡ Pulse'),
    React.createElement(Text, { color: theme.gray }, 'Ask anything. Type your message below.'),
    React.createElement(
      Box, { marginTop: 1, flexDirection: 'row', gap: 2 },
      React.createElement(Text, { color: theme.gray }, '/help  commands'),
      React.createElement(Text, { color: theme.gray }, '/clear  reset'),
      React.createElement(Text, { color: theme.gray }, '/exit  quit'),
    ),
  );

const ChatPane = ({ messages, isThinking }) => {
  const { stdout } = useStdout();

  // ── Calculate max messages we can show ──────────────────────────
  // Each message occupies roughly: 1 line badge + N body lines + 1 gap.
  // We approximate 3 lines per message so the viewport never overflows.
  // Header = 3, statusBar = 1, input = 3 → chrome = 7
  const rows        = (stdout ? stdout.rows : process.stdout.rows) || 24;
  const chromeLines = 7;
  const paneLines   = Math.max(4, rows - chromeLines);
  const linesPerMsg = 3;                         // badge + 1 body + gap
  const maxVisible  = Math.max(1, Math.floor(paneLines / linesPerMsg));

  // Slice to the tail (most-recent) messages
  const hasMore = messages.length > maxVisible;
  const visible = hasMore
    ? messages.slice(messages.length - maxVisible)
    : messages;

  // ── Render ────────────────────────────────────────────────────────
  if (messages.length === 0 && !isThinking) {
    return React.createElement(EmptyState);
  }

  return React.createElement(
    Box,
    {
      flexDirection:  'column',
      flexGrow:       1,
      paddingX:       2,
      paddingTop:     1,
      overflowY:      'hidden',
    },

    // "↑ N older messages" clip hint
    hasMore
      ? React.createElement(
          Box, { marginBottom: 1, flexShrink: 0 },
          React.createElement(
            Text, { color: theme.gray, dimColor: true },
            `↑ ${messages.length - maxVisible} older message${messages.length - maxVisible === 1 ? '' : 's'} above`
          )
        )
      : null,

    // Message list
    ...visible.map((msg, i) =>
      React.createElement(MessageBubble, {
        key:     i,
        msg:     msg,
        isFirst: i === 0,
      })
    ),

    // Thinking spinner
    isThinking ? React.createElement(ThinkingRow) : null,
  );
};

module.exports = ChatPane;
