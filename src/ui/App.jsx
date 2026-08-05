const React = require('react');
const { useState, useEffect } = require('react');
const { Box, Text, useInput, useApp } = require('ink');
const Header = require('./Header');
const ChatView = require('./ChatView');
const InputBox = require('./InputBox');
const Sidebar = require('./Sidebar');

const App = ({ session, processUserMessage, onExit }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState(
    session.conversation.messages.filter(m => m.role !== 'system') || []
  );
  const [isThinking, setIsThinking] = useState(false);
  
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onExit();
      exit();
    }
  });

  const handleSubmit = async (text) => {
    if (!text.trim() || isThinking) return;
    
    setIsThinking(true);
    
    // Process message using the adapted logic
    await processUserMessage(text, (updatedMessages) => {
      setMessages([...updatedMessages]);
    });
    
    setIsThinking(false);
  };

  return (
    <Box flexDirection="column" height={process.stdout.rows - 1 || 24}>
      <Header config={session.config} />
      <Box flexGrow={1} flexDirection="row">
        <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <ChatView messages={messages} isThinking={isThinking} />
        </Box>
        <Sidebar session={session} />
      </Box>
      <InputBox onSubmit={handleSubmit} isThinking={isThinking} />
    </Box>
  );
};

module.exports = App;
