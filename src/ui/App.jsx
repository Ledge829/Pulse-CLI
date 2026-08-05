/**
 * App — root layout component
 *
 * Layout stack (top → bottom, flexDirection: 'column'):
 *
 *   ┌─────────────────────────────────────────┐  ← Header (3 lines)
 *   │                                         │
 *   │              ChatPane                   │  ← flexGrow: 1
 *   │     (viewport-clipped message list)     │
 *   │                                         │
 *   ├─────────────────────────────────────────┤  ← InputBar (3 lines)
 *   │ › _                                     │
 *   └─────────────────────────────────────────┘
 *   /help commands  /clear reset  …  ○ ready    ← StatusBar (1 line)
 *
 * Design decisions:
 * - height is capped at process.stdout.rows to prevent Ink from ever
 *   rendering more lines than the terminal has, which causes overlap.
 * - The sidebar has been removed. Its info (provider, model, msg count)
 *   moved to the Header where it belongs.
 * - App owns message state and the isThinking flag; children are pure.
 * - Ctrl+C is handled here (not in InputBar) so it works regardless of
 *   focus state.
 * - processUserMessage is injected by the caller (chat.js) so the UI
 *   layer stays decoupled from the AI engine.
 *
 * @module ui/App
 */

'use strict';
const React = require('react');
const { Box, useInput, useApp } = require('ink');
const Header    = require('./Header');
const ChatPane  = require('./ChatPane');
const InputBar  = require('./InputBar');
const StatusBar = require('./StatusBar');

const App = ({ session, processUserMessage, onExit }) => {
  const { exit } = useApp();

  // ── State ─────────────────────────────────────────────────────────
  const [messages, setMessages] = React.useState(
    (session.conversation.messages || []).filter(m => m.role !== 'system')
  );
  const [isThinking, setIsThinking] = React.useState(false);

  // ── Global key bindings ───────────────────────────────────────────
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      try { onExit(); } catch (_) {}
      exit();
    }
  });

  // ── Message submission ────────────────────────────────────────────
  const handleSubmit = async (text) => {
    if (!text.trim() || isThinking) return;
    setIsThinking(true);
    try {
      await processUserMessage(text, (updated) => {
        setMessages([...updated]);
      });
    } finally {
      setIsThinking(false);
    }
  };

  // ── Terminal height guard ─────────────────────────────────────────
  // Ink uses process.stdout.rows at render time. Clamp to available rows
  // minus 1 so the shell prompt line isn't overwritten after exit.
  const termRows = (process.stdout.rows || 24) - 1;

  // ── Render ────────────────────────────────────────────────────────
  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      height:        termRows,
      // No width clamp — let it fill the terminal naturally
    },

    // ① Header — always visible, 3 lines
    React.createElement(Header, {
      config:       session.config,
      messageCount: messages.length,
    }),

    // ② Chat pane — fills all remaining space
    React.createElement(ChatPane, { messages, isThinking }),

    // ③ Input — always visible at bottom, 3 lines
    React.createElement(InputBar, {
      onSubmit:   handleSubmit,
      isThinking: isThinking,
    }),

    // ④ Status bar — 1 line of hints
    React.createElement(StatusBar, { isThinking }),
  );
};

module.exports = App;
