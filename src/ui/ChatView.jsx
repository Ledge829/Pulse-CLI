const React = require('react');
const { useEffect, useState, useRef } = require('react');
const { Box, Text } = require('ink');
const Spinner = require('ink-spinner').default;

// Fallback spinner if ink-spinner is not installed or fails
const SafeSpinner = () => {
  try {
    return <Spinner type="dots" />;
  } catch (e) {
    return <Text>...</Text>;
  }
};

const ChatView = ({ messages, isThinking }) => {
  // To handle scrolling if needed, or simply render the last N lines.
  // Ink's Static or a sliding window can be used for long histories.
  
  // For simplicity, we just display the last few messages that fit.
  // We filter out system messages usually, which is done in App.jsx.

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflowY="hidden">
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user';
        return (
          <Box key={idx} flexDirection="column" marginY={1}>
            <Text bold color={isUser ? 'green' : 'cyan'}>
              {isUser ? 'You' : 'Assistant'}
            </Text>
            <Box paddingLeft={2} width="100%">
              {/* If it's a tool call string, color it dim */}
              {msg.content.startsWith('[Tool') ? (
                <Text color="gray">{msg.content}</Text>
              ) : (
                <Text>{msg.content}</Text>
              )}
            </Box>
          </Box>
        );
      })}
      
      {isThinking && (
        <Box flexDirection="row" marginTop={1}>
          <Text bold color="cyan">Assistant </Text>
          <Text color="gray">
            <SafeSpinner /> thinking...
          </Text>
        </Box>
      )}
    </Box>
  );
};

module.exports = ChatView;
