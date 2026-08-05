/**
 * StatusBar — single-line footer below the input
 *
 * Shows keyboard shortcut hints. Deliberately kept to 1 line with no border
 * so it feels like a discrete status strip, not another panel.
 *
 * @module ui/StatusBar
 */

'use strict';
const React = require('react');
const { Box, Text } = require('ink');
const theme = require('./theme');

const HINTS = [
  ['/help', 'commands'],
  ['/clear', 'reset'],
  ['/model', 'switch model'],
  ['Ctrl+U', 'clear line'],
  ['Ctrl+C', 'exit'],
];

const StatusBar = ({ isThinking }) =>
  React.createElement(
    Box,
    {
      paddingX:       2,
      flexDirection:  'row',
      flexShrink:     0,
      justifyContent: 'space-between',
    },

    // Hint strip on the left
    React.createElement(
      Box,
      { flexDirection: 'row', gap: 2 },
      ...HINTS.map(([key, label], i) =>
        React.createElement(
          Box, { key: i, flexDirection: 'row', gap: 0 },
          React.createElement(Text, { color: theme.cyan, bold: true }, key),
          React.createElement(Text, { color: theme.gray }, ` ${label}`),
        )
      )
    ),

    // State indicator on the right
    isThinking
      ? React.createElement(Text, { color: theme.yellow, dimColor: true }, '● thinking')
      : React.createElement(Text, { color: theme.gray, dimColor: true }, '○ ready'),
  );

module.exports = StatusBar;
