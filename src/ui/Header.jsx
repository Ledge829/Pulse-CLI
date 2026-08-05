/**
 * Header — top bar of the Pulse TUI
 *
 * Layout (single row, no wrap):
 *   [ ♡ Pulse  ·  provider · model ]   [ msgs: N  Ctrl+C exit ]
 *
 * Design decisions:
 * - borderStyle 'single' gives a clean 1-char top/bottom rule
 * - justifyContent 'space-between' keeps left brand + right status apart
 * - no magenta accent on border — cyan keeps it consistent with input
 *
 * @module ui/Header
 */

'use strict';
const React  = require('react');
const { Box, Text } = require('ink');
const theme  = require('./theme');

const Header = ({ config, messageCount }) => {
  const version = (() => {
    try { return require('../../package.json').version; } catch { return ''; }
  })();

  return React.createElement(
    Box,
    {
      borderStyle:  theme.borderStyle,
      borderColor:  theme.headerBorderColor,
      paddingX:     1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexShrink: 0,          // never let Ink compress the header
    },

    // ── Left: brand ────────────────────────────────────────────────
    React.createElement(
      Box,
      { flexDirection: 'row', gap: 1 },
      React.createElement(Text, { color: theme.cyan, bold: true }, theme.logo),
      version
        ? React.createElement(Text, { color: theme.gray }, `v${version}`)
        : null,
      React.createElement(Text, { color: theme.gray }, '·'),
      React.createElement(Text, { color: theme.white }, config.provider),
      React.createElement(Text, { color: theme.gray }, '/'),
      React.createElement(Text, { color: theme.white }, config.model),
    ),

    // ── Right: status ───────────────────────────────────────────────
    React.createElement(
      Box,
      { flexDirection: 'row', gap: 1 },
      React.createElement(Text, { color: theme.gray },
        `${messageCount || 0} msg${(messageCount || 0) === 1 ? '' : 's'}`
      ),
      React.createElement(Text, { color: theme.gray }, '·'),
      React.createElement(Text, { color: theme.gray }, 'Ctrl+C exit'),
    ),
  );
};

module.exports = Header;
