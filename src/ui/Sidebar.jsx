const React = require('react');
const { Box, Text } = require('ink');

const Sidebar = ({ session }) => {
  return React.createElement(
    Box,
    {
      width: 30,
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: 'magenta',
      paddingX: 1,
      marginLeft: 1,
    },
    React.createElement(Text, { bold: true, color: 'magenta' }, 'Session Info'),
    React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      React.createElement(Text, null, [
        React.createElement(Text, { color: 'gray' }, 'Mode: '),
        React.createElement(Text, { color: 'white' }, 'Chat')
      ]),
      React.createElement(Text, null, [
        React.createElement(Text, { color: 'gray' }, 'Messages: '),
        React.createElement(Text, { color: 'white' }, session.conversation.messageCount)
      ])
    ),
    React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      React.createElement(Text, null, [
        React.createElement(Text, { color: 'gray' }, 'Tools: '),
        React.createElement(Text, { color: 'white' }, 'Available')
      ])
    )
  );
};

module.exports = Sidebar;
