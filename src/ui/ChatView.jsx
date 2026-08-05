const React = require('react');
const { Box, Text } = require('ink');
const Spinner = require('ink-spinner').default;

// SafeSpinner fallback
const SafeSpinner = () => {
  try {
    return React.createElement(Spinner, { type: 'dots' });
  } catch (e) {
    return React.createElement(Text, null, '...');
  }
};

const ChatView = ({ messages, isThinking }) => {
  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%', flexGrow: 1, overflowY: 'hidden' },
    messages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      return React.createElement(
        Box,
        { key: idx, flexDirection: 'column', marginY: 1 },
        React.createElement(
          Text,
          { bold: true, color: isUser ? 'green' : 'cyan' },
          isUser ? 'You' : 'Assistant'
        ),
        React.createElement(
          Box,
          { paddingLeft: 2, width: '100%' },
          msg.content.startsWith('[Tool')
            ? React.createElement(Text, { color: 'gray' }, msg.content)
            : React.createElement(Text, null, msg.content)
        )
      );
    }),
    isThinking &&
      React.createElement(
        Box,
        { flexDirection: 'row', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Assistant '),
        React.createElement(Text, null, React.createElement(SafeSpinner, null), ' thinking...')
      )
  );
};

module.exports = ChatView;
