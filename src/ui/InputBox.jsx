const React = require('react');
const { useState } = require('react');
const { Box, Text } = require('ink');
let TextInput;
try {
  TextInput = require('ink-text-input').default;
} catch (e) {
  // Fallback if ink-text-input is not available yet
  TextInput = ({ value, onChange, onSubmit, placeholder }) => {
    return <Text color="gray">{placeholder} (ink-text-input loading...)</Text>;
  };
}

const InputBox = ({ onSubmit, isThinking }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (query.trim() && !isThinking) {
      onSubmit(query);
      setQuery('');
    }
  };

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="row">
      <Text bold color="cyan">╰─➤ </Text>
      <Box flexGrow={1} marginLeft={1}>
        {isThinking ? (
          <Text color="gray">Waiting for response...</Text>
        ) : (
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            placeholder="Type your message..."
          />
        )}
      </Box>
    </Box>
  );
};

module.exports = InputBox;
