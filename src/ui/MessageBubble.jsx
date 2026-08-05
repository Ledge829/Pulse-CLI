/**
 * MessageBubble — renders a single chat message
 *
 * Design decisions:
 * - Role badge is inline, left-aligned, bold+coloured
 * - Message body indented by 4 chars to create clear vertical rhythm
 * - Tool messages (starting "[Tool") are visually muted
 * - Error messages get red treatment
 * - Multi-line messages are just rendered as Text; Ink handles wrapping
 *   via flexShrink/flexWrap on the parent Box.
 * - No heavy box-drawing per message — that adds noise at scale
 * - 1-line gap (marginTop: 1) between messages, not both top+bottom
 *   (avoids doubled spacing).
 *
 * @module ui/MessageBubble
 */

'use strict';
const React = require('react');
const { Box, Text } = require('ink');
const theme = require('./theme');

/** Classify a message and return display metadata */
function classify(msg) {
  const { role, content } = msg;
  if (role === 'user') {
    return {
      badge:     theme.userBadge,
      badgeColor: theme.userColor,
      bodyColor:  theme.white,
      dim:        false,
    };
  }
  if (role === 'assistant') {
    // Tool trace messages are muted
    if (content.startsWith('[Calling tool') || content.startsWith('[Tool result')) {
      return {
        badge:     theme.toolBadge,
        badgeColor: theme.toolColor,
        bodyColor:  theme.gray,
        dim:        true,
      };
    }
    // Error messages from AI engine
    if (content.startsWith('[Error') || content.startsWith('[Streaming Error')) {
      return {
        badge:     theme.errorBadge,
        badgeColor: theme.errorColor,
        bodyColor:  theme.red,
        dim:        false,
      };
    }
    return {
      badge:     theme.assistantBadge,
      badgeColor: theme.assistantColor,
      bodyColor:  theme.white,
      dim:        false,
    };
  }
  return {
    badge:     '?',
    badgeColor: theme.gray,
    bodyColor:  theme.gray,
    dim:        true,
  };
}

const MessageBubble = ({ msg, isFirst }) => {
  const { badge, badgeColor, bodyColor, dim } = classify(msg);

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      marginTop:     isFirst ? 0 : 1,   // gap above every message except the first
      flexShrink:    0,                  // don't collapse messages
    },

    // ── Badge row ──────────────────────────────────────────────────
    React.createElement(
      Box,
      { flexDirection: 'row', gap: 1 },
      React.createElement(
        Text,
        { color: badgeColor, bold: true },
        badge
      ),
    ),

    // ── Body ───────────────────────────────────────────────────────
    React.createElement(
      Box,
      { paddingLeft: 2 },
      React.createElement(
        Text,
        { color: bodyColor, dimColor: dim, wrap: 'wrap' },
        msg.content
      )
    ),
  );
};

module.exports = MessageBubble;
