const React = require('react');
const { Box, Text } = require('ink');
const chalk = require('chalk');

const Header = ({ config }) => {
  return (
    <Box 
      borderStyle="single" 
      borderColor="magenta" 
      paddingX={2} 
      flexDirection="row" 
      justifyContent="space-between"
    >
      <Text bold color="cyan">♡ Pulse CLI</Text>
      <Box>
        <Text color="gray">Provider: </Text>
        <Text color="white" bold>{config.provider}</Text>
        <Text color="gray"> | Model: </Text>
        <Text color="white" bold>{config.model}</Text>
      </Box>
      <Text color="gray">Press Ctrl+C to exit</Text>
    </Box>
  );
};

module.exports = Header;
