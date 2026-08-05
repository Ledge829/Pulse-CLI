const React = require('react');
const { Box, Text } = require('ink');

const Sidebar = ({ session }) => {
  return (
    <Box 
      width={30} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="magenta" 
      paddingX={1}
      marginLeft={1}
    >
      <Text bold color="magenta">Session Info</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Mode: <Text color="white">Chat</Text></Text>
        <Text color="gray">Messages: <Text color="white">{session.conversation.messageCount}</Text></Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Tools: <Text color="white">Available</Text></Text>
      </Box>
    </Box>
  );
};

module.exports = Sidebar;
