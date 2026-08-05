const React = require('react');
const { Box, Text, useInput } = require('ink');

/**
 * InputBox component without ink-text-input dependency.
 * Captures user input via Ink's useInput hook.
 */
const InputBox = ({ onSubmit, isThinking }) => {
  const [query, setQuery] = React.useState('');

  // Handle keyboard input
  useInput((input, key) => {
    if (isThinking) return; // disable while waiting for response

    if (key.return) {
      const trimmed = query.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setQuery('');
      }
      return;
    }

    if (key.backspace) {
      setQuery(prev => prev.slice(0, -1));
      return;
    }

    // Append printable characters
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(prev => prev + input);
    }
  });

  return React.createElement(
    Box,
    { borderStyle: 'single', borderColor: 'cyan', paddingX: 1, flexDirection: 'row' },
    React.createElement(Text, { bold: true, color: 'cyan' }, '╰─➤ '),
    React.createElement(
      Box,
      { flexGrow: 1, marginLeft: 1 },
      isThinking
        ? React.createElement(Text, { color: 'gray' }, 'Waiting for response...')
        : React.createElement(Text, null, query)
    )
  );
};

module.exports = InputBox;
