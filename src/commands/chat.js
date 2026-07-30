/**
 * Pulse CLI Chat — the main chat loop
 *
 * This is the heart of Pulse CLI. When you type `pulse` in your terminal,
 * this file runs the interactive chat session.
 *
 * How it works:
 * 1. It shows you a prompt (╰─➤)
 * 2. You type a message and press Enter
 * 3. Your message is sent to the AI provider (OpenAI, Gemini, etc.)
 * 4. The AI's response is streamed back to your terminal
 * 5. If the AI asks to use a tool (read a file, search code, etc.),
 *    Pulse CLI runs that tool and sends the result back to the AI
 * 6. The conversation is saved to a file so you can resume later
 */

// ── Built-in modules (no npm needed) ──────────────────────────────────
const readline = require('readline');   // For reading user input in the terminal
const chalk = require('chalk');        // For colored text in the terminal

// ── Pulse CLI internal modules ────────────────────────────────────────
const { ConfigError } = require('../lib/errors');          // Error handling
const { ConversationStore } = require('../lib/storage');    // Saves conversations
const { createProvider } = require('../providers/index');   // Creates AI providers
const { showWelcome } = require('../ui/banner');            // The welcome screen
const { startSpinner, succeedSpinner, failSpinner } = require('../ui/spinner');
const { getModels } = require('../lib/models');             // Curated model lists
const { createAgent, parseToolCalls } = require('../agent/index'); // Agent tools

// ── The system prompt ─────────────────────────────────────────────────
// This message is sent to the AI at the start of every conversation.
// It tells the AI how to behave.
const SYSTEM_PROMPT = `You are Pulse CLI, an AI coding assistant running in a terminal.

Help with programming, debugging, code review, and technical questions.
Keep responses concise. Format code with markdown code blocks.
Current date: ${new Date().toISOString().slice(0, 10)}.

When asked to read files, search code, or run commands, output ONLY a JSON tool call:
{"tool":"file_read","path":"file.js"}
{"tool":"file_search","pattern":"function"}
{"tool":"file_tree","depth":3}
{"tool":"git_status"}
{"tool":"git_log","count":10}
{"tool":"terminal_run","command":"npm test"}
Do NOT explain the tool call — just output the JSON.`;

// Where conversations are stored on disk
const CONVERSATIONS_DIRECTORY = require('../lib/storage').DEFAULT_DIR;

// ═══════════════════════════════════════════════════════════════════════
// SLASH COMMANDS
// ═══════════════════════════════════════════════════════════════════════
// These are commands the user can type in chat, like /help, /clear, etc.
// Each command has:
//   - description: What it does (shown in /help)
//   - usage: How to use it
//   - handler: The function that runs when you type it

const SLASH_COMMANDS = {
  // ── /help — Shows all available commands ──────────────────────────
  help: {
    description: 'Show this help message',
    usage: '/help',
    handler: function showHelp() {
      console.log(chalk.bold('\n  Commands\n'));

      // Loop through all commands and print them
      for (const [commandName, commandInfo] of Object.entries(SLASH_COMMANDS)) {
        // Skip the "quit" command because it's just an alias for "exit"
        if (commandName === 'quit') continue;

        // Print the command usage and description
        const paddedUsage = commandInfo.usage.padEnd(28);
        console.log(`  ${chalk.cyan(paddedUsage)} ${chalk.dim(commandInfo.description)}`);
      }

      // Print some extra usage tips
      console.log(`  ${chalk.dim('Enter'.padEnd(28))} ${chalk.dim('Send message')}`);
      console.log(`  ${chalk.dim('Ctrl+C'.padEnd(28))} ${chalk.dim('Cancel / exit')}`);
      console.log();
    }
  },

  // ── /clear — Clears the terminal screen ──────────────────────────
  clear: {
    description: 'Clear the screen',
    usage: '/clear',
    handler: function clearScreen() {
      console.clear();
    }
  },

  // ── /exit — Quits Pulse CLI ──────────────────────────────────────
  exit: {
    description: 'Exit Pulse CLI',
    usage: '/exit',
    handler: function exitPulse() {
      process.exit(0);
    }
  },

  // ── /quit — Same as /exit ────────────────────────────────────────
  quit: {
    description: 'Exit Pulse CLI (alias for /exit)',
    usage: '/quit',
    handler: function quitPulse() {
      process.exit(0);
    }
  },

  // ── /model — Switch to a different model ─────────────────────────
  model: {
    description: 'Show or switch the AI model',
    usage: '/model <name>',
    handler: function switchModel(session, argumentsList) {
      const modelName = argumentsList[0];

      // If no model name was given, show the list of available models
      if (!modelName) {
        const models = getModels(session.config.provider);
        console.log(chalk.bold(`\n  ${session.config.provider} models:\n`));

        for (const model of models) {
          const freeTag = model.free ? chalk.green(' FREE') : '';
          const isCurrentModel = model.name === session.config.model;
          const currentMarker = isCurrentModel ? chalk.cyan(' ←') : '';

          console.log(`  ${chalk.cyan('•')} ${chalk.bold(model.name)}${freeTag}${currentMarker}`);
          console.log(`    ${chalk.dim(model.description)}`);
        }

        console.log(chalk.dim(`\n  Use /model <model_name> to switch.\n`));
        return;
      }

      // Switch to the new model
      session.config.model = modelName;
      session.conversation.model = modelName;
      console.log(chalk.dim(`\n  Model switched to: ${chalk.bold(modelName)}\n`));
    }
  },

  // ── /models — List all models for the current provider ───────────
  models: {
    description: 'List available models for the current provider',
    usage: '/models',
    handler: function listModelsInfo(session) {
      const models = getModels(session.config.provider);

      // If we don't have a curated list for this provider
      if (models.length === 0) {
        console.log(chalk.dim(`\n  No model list for ${session.config.provider}\n`));
        return;
      }

      // Print each model with its free/paid status
      console.log(chalk.bold(`\n  ${session.config.provider}:\n`));
      for (const model of models) {
        const priceTag = model.free ? chalk.green(' FREE') : chalk.yellow(' paid');
        const isCurrentModel = model.name === session.config.model;
        const currentMarker = isCurrentModel ? chalk.cyan(' ←') : '';

        console.log(`  ${chalk.cyan('•')} ${chalk.bold(model.name)}${priceTag}${currentMarker}`);
      }
      console.log();
    }
  },

  // ── /provider — Switch to a different AI provider ────────────────
  provider: {
    description: 'Show or switch the AI provider',
    usage: '/provider <name>',
    handler: function switchProvider(session, argumentsList) {
      const providerName = argumentsList[0];

      // If no provider name was given, show the current one
      if (!providerName) {
        console.log(chalk.dim(`  Current provider: ${chalk.bold(session.config.provider)}\n`));
        return;
      }

      // Try to switch to the new provider
      try {
        // Create a new config with the new provider
        const newConfig = {
          ...session.config,
          provider: providerName
        };

        // Create the new provider instance
        session.provider = createProvider(newConfig);
        session.config = newConfig;
        session.conversation.provider = providerName;

        // Auto-select the first model from the curated list
        const models = getModels(providerName);
        if (models.length > 0) {
          session.config.model = models[0].name;
          session.conversation.model = models[0].name;
        }

        // Re-create the agent tools for the new provider
        const agent = createAgent({ cwd: process.cwd() });
        session.toolRegistry = agent.registry;
        session.toolContext = agent.context;

        console.log(chalk.green(`  Switched to: ${providerName} · ${session.config.model}\n`));
      } catch (error) {
        console.log(chalk.red(`  ✖ ${error.message}\n`));
      }
    }
  },

  // ── /new — Start a brand new conversation ────────────────────────
  new: {
    description: 'Start a new conversation',
    usage: '/new',
    handler: async function startNew(session) {
      // Save the current conversation first
      if (session.conversation.messageCount > 0) {
        try {
          await session.conversation.save();
        } catch (saveError) {
          // Ignore save errors
        }
      }

      // Create a new blank conversation
      const store = new ConversationStore(CONVERSATIONS_DIRECTORY);
      session.conversation = store.create({
        model: session.config.model,
        provider: session.config.provider,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT }
        ]
      });

      console.log(chalk.dim('  Started a new conversation.\n'));
    }
  },

  // ── /multiline — Toggle multiline input mode ─────────────────────
  multiline: {
    description: 'Toggle multiline input mode (for pasting code)',
    usage: '/multiline',
    handler: function toggleMultiline(session) {
      // Flip the multiline flag
      session.multilineMode = !session.multilineMode;

      if (session.multilineMode) {
        console.log(chalk.dim('\n  Multiline mode: ON\n  Type your message, press Enter on an empty line to send.\n'));
      } else {
        console.log(chalk.dim('\n  Multiline mode: OFF\n  Press Enter to send immediately.\n'));
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// INPUT COLLECTION
// ═══════════════════════════════════════════════════════════════════════
// This reads what the user types. There are two modes:
//   - Single-line mode (default): You type and press Enter → message is sent
//   - Multiline mode:        You type multiple lines, empty Enter sends them all

async function collectUserInput(session) {
  // This holds multiple lines when in multiline mode
  const inputBuffer = [];

  return new Promise(function(resolvePromise) {
    // Remove old line handlers so we don't have duplicates
    session.readline.removeAllListeners('line');

    // ── SINGLE-LINE MODE ────────────────────────────────────────────
    // This is the default mode. Pressing Enter sends your message immediately.
    if (!session.multilineMode) {

      // Listen for when the user presses Enter
      session.readline.on('line', function(userInput) {
        const trimmedInput = userInput.trimEnd();

        // If the user pressed Enter on an empty line, just show the prompt again
        if (!trimmedInput) {
          session.readline.prompt();
          return;
        }

        // Send the message back to the main loop
        resolvePromise({
          text: trimmedInput,
          isCommand: trimmedInput.startsWith('/')  // Starts with / → it's a command
        });
      });

      // Show the input prompt
      session.readline.setPrompt(chalk.cyan('╰─➤  '));
      session.readline.prompt();

    // ── MULTILINE MODE ─────────────────────────────────────────────
    // Pressing Enter adds a new line. Press Enter on an empty line to send.
    } else {
      let isFirstLine = true;

      // Show the right prompt (different for first line vs continuation)
      function showPrompt() {
        if (isFirstLine) {
          session.readline.setPrompt(chalk.cyan('╰─➤  '));
          isFirstLine = false;
        } else {
          session.readline.setPrompt(chalk.dim('│  '));
        }
        session.readline.prompt();
      }

      // Listen for each line the user types
      session.readline.on('line', function(userInput) {
        const trimmedInput = userInput.trimEnd();

        // If this is the first line and it starts with /, treat as command
        if (inputBuffer.length === 0 && trimmedInput.startsWith('/')) {
          resolvePromise({ text: trimmedInput, isCommand: true });
          return;
        }

        // If the line is empty and we have text buffered → send it
        if (trimmedInput === '' && inputBuffer.length > 0) {
          resolvePromise({ text: inputBuffer.join('\n'), isCommand: false });
          return;
        }

        // Otherwise, add this line to the buffer and continue
        inputBuffer.push(userInput);
        showPrompt();
      });

      showPrompt();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL CALL DETECTION
// ═══════════════════════════════════════════════════════════════════════
// When the AI wants to use a tool (like reading a file), it responds with
// JSON instead of normal text. This function detects that JSON.

function detectToolCalls(aiResponseText) {
  const detectedCalls = [];

  // ── Try JSON format ──────────────────────────────────────────────
  // The AI might respond with:
  //   {"tool": "file_read", "path": "file.js"}
  //   {"name": "file_read", "params": {"path": "file.js"}}
  try {
    const parsedJSON = JSON.parse(aiResponseText);

    // Format: {"tool": "file_read", "path": "file.js", ...}
    if (parsedJSON.tool) {
      // Extract all params (everything except "tool")
      const params = {};
      for (const key of Object.keys(parsedJSON)) {
        if (key !== 'tool') {
          params[key] = parsedJSON[key];
        }
      }
      detectedCalls.push({ name: parsedJSON.tool, params: params });
    }

    // Format: {"name": "file_read", "params": {"path": "file.js"}}
    if (parsedJSON.name && parsedJSON.params) {
      detectedCalls.push({ name: parsedJSON.name, params: parsedJSON.params });
    }

    // Format: [{...}, {...}] — an array of tool calls
    if (Array.isArray(parsedJSON)) {
      for (const item of parsedJSON) {
        if (item.tool) {
          detectedCalls.push({ name: item.tool, params: item });
        }
      }
    }

    // If we found tool calls, return them now
    if (detectedCalls.length > 0) {
      return detectedCalls;
    }
  } catch (parseError) {
    // Not valid JSON — that's fine, it's probably normal text
  }

  // ── Try XML format ───────────────────────────────────────────────
  // The AI might also respond with:
  //   <tool name="file_read">
  //     <param name="path">file.js</param>
  //   </tool>
  const xmlPattern = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let xmlMatch;

  while ((xmlMatch = xmlPattern.exec(aiResponseText)) !== null) {
    const toolName = xmlMatch[1];
    const toolBody = xmlMatch[2];

    // Extract all <param> elements
    const params = {};
    const paramPattern = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
    let paramMatch;

    while ((paramMatch = paramPattern.exec(toolBody)) !== null) {
      params[paramMatch[1]] = paramMatch[2].trim();
    }

    detectedCalls.push({ name: toolName, params: params });
  }

  return detectedCalls;
}

// ═══════════════════════════════════════════════════════════════════════
// PROCESS A USER MESSAGE
// ═══════════════════════════════════════════════════════════════════════
// This handles everything that happens when you send a message:
//   1. Sends your message to the AI
//   2. If the AI wants to use a tool, runs that tool
//   3. Sends the tool result back to the AI
//   4. Gets the final response and displays it

async function processUserMessage(session, userMessage) {
  // ── Step 0: Save the user's message ──────────────────────────────
  session.conversation.addMessage('user', userMessage);
  session.conversation.deriveTitle(userMessage);

  // Create a fresh abort controller so we can cancel if needed
  const abortController = new AbortController();
  session.abortController = abortController;
  session.isStreaming = true;

  // Get all messages from the conversation (including system prompt)
  const messagesForAI = session.conversation.messages.map(function(msg) {
    return { role: msg.role, content: msg.content };
  });

  // ── Tool call loop ───────────────────────────────────────────────
  // This loop keeps running until the AI responds with normal text
  // (instead of a tool call). Max 10 rounds to prevent infinite loops.
  let finalResponseText = '';

  for (let roundNumber = 0; roundNumber < 10; roundNumber++) {
    // Check if the user cancelled
    if (abortController.signal.aborted) {
      session.isStreaming = false;
      return;
    }

    // Show a spinner while waiting for the AI
    let spinnerText = '  Processing…';
    if (roundNumber > 0) {
      spinnerText = `  Tool round ${roundNumber}…`;
    }
    const spinner = startSpinner(spinnerText);

    // ── Send messages to the AI provider ───────────────────────────
    let aiResponse;
    try {
      // This sends all messages to the AI and waits for a complete response
      aiResponse = await session.provider.chatComplete(
        messagesForAI,
        abortController.signal
      );
    } catch (error) {
      failSpinner(spinner, error.message || 'Request failed');
      session.isStreaming = false;
      throw error; // Let the main loop handle the error
    }

    // Mark the spinner as done
    succeedSpinner(spinner);

    // Get the text response from the AI
    const aiText = (aiResponse.content || '').trim();

    // If the AI didn't say anything, stop
    if (aiText === '') {
      session.isStreaming = false;
      return;
    }

    // ── Check if the AI is making a tool call ──────────────────────
    const toolCalls = detectToolCalls(aiText);

    // If no tool calls were detected, this is the final response
    if (toolCalls.length === 0) {
      // Display the response to the user
      console.log(`  ${chalk.cyan('Assistant')} ${chalk.dim(`[${session.config.model}]`)}`);

      // Print each line of the response
      const responseLines = aiText.split('\n');
      for (const line of responseLines) {
        console.log(`  ${line}`);
      }
      console.log();

      // Save to conversation
      session.conversation.addMessage('assistant', aiText);

      // Save to disk
      try {
        await session.conversation.save();
      } catch (saveError) {
        // Ignore save errors
      }

      session.isStreaming = false;
      return;
    }

    // ── Tool calls were detected — execute them ────────────────────
    console.log(`  ${chalk.cyan('▸ Running tools:')}`);

    const toolResults = [];

    for (const toolCall of toolCalls) {
      // Show what tool is being called
      const paramsString = JSON.stringify(toolCall.params);
      console.log(`    ${chalk.cyan('·')} ${chalk.bold(toolCall.name)} ${chalk.dim(paramsString)}`);

      // Execute the tool using the agent's tool registry
      try {
        const toolResult = await session.toolRegistry.execute(
          toolCall.name,
          toolCall.params,
          session.toolContext
        );

        // Convert the result to text
        let resultText;
        if (typeof toolResult === 'string') {
          resultText = toolResult;
        } else {
          resultText = JSON.stringify(toolResult, null, 2);
        }

        // Add the result to our list
        toolResults.push({
          role: 'user',
          content: `[Tool ${toolCall.name} result]\n${resultText}`
        });

        // Show a preview of the result (first 100 chars)
        const preview = resultText.slice(0, 100);
        console.log(`    ${chalk.green('✓')} ${chalk.dim(preview)}${resultText.length > 100 ? '…' : ''}`);

      } catch (toolError) {
        // If the tool failed, tell the AI about the error
        toolResults.push({
          role: 'user',
          content: `[Tool ${toolCall.name} error]\n${toolError.message}`
        });
        console.log(`    ${chalk.red('✖')} ${chalk.dim(toolError.message)}`);
      }
    }

    console.log(); // Empty line for readability

    // Add the AI's response and tool results to the messages
    // The AI will see its own tool call and the results, then respond
    messagesForAI.push({ role: 'assistant', content: aiText });
    for (const result of toolResults) {
      messagesForAI.push(result);
    }

    // Loop back to send everything to the AI again
    // The AI should now respond with the final answer
  }

  // ── If we reached here, the tool loop ended without a final response ──
  // Fall back to streaming the response directly to the user
  session.isStreaming = false;

  try {
    const spinner = startSpinner('  …');
    let hasReceivedAnyContent = false;

    // Stream the response token by token
    const streamMessages = session.conversation.messages.map(function(msg) {
      return { role: msg.role, content: msg.content };
    });

    for await (const chunk of session.provider.streamChat(
      streamMessages,
      abortController.signal
    )) {
      if (!hasReceivedAnyContent) {
        hasReceivedAnyContent = true;
        spinner.stop();
        console.log(`  ${chalk.cyan('Assistant')} ${chalk.dim(`[${session.config.model}]`)}`);
      }

      if (chunk) {
        finalResponseText += chunk;
        process.stdout.write(chunk);
      }
    }

    if (!hasReceivedAnyContent) {
      spinner.stop();
    }

    if (hasReceivedAnyContent) {
      process.stdout.write('\n\n');
    }

    // Save the response if we got one
    if (finalResponseText) {
      session.conversation.addMessage('assistant', finalResponseText);
      try {
        await session.conversation.save();
      } catch (saveError) {
        // Ignore save errors
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`  ${chalk.red('✖')} ${chalk.dim(error.message)}\n`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SIGINT HANDLING (Ctrl+C)
// ═══════════════════════════════════════════════════════════════════════

function handleCtrlC(session) {
  // If the AI is currently responding, cancel the response
  if (session.isStreaming) {
    session.abortController.abort();
    console.log(chalk.dim('\n  Cancelled.\n'));
    return;
  }

  // Otherwise, save the conversation and exit
  try {
    session.conversation.save();
  } catch (saveError) {
    // Ignore save errors during exit
  }

  console.log(chalk.dim('\n  Goodbye!\n'));
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
// THE MAIN CHAT LOOP
// ═══════════════════════════════════════════════════════════════════════
// This function starts the interactive chat session.

async function startChat(config) {
  // ── Step 1: Set up conversation storage ──────────────────────────
  const store = new ConversationStore(CONVERSATIONS_DIRECTORY);

  // Try to load the most recent conversation (so you can resume)
  let conversation = await store.latest().catch(function() {
    return null;
  });

  // If there's no saved conversation, create a new one
  if (!conversation) {
    conversation = store.create({
      model: config.model,
      provider: config.provider,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT }
      ]
    });
  }

  // ── Step 2: Create the AI provider ───────────────────────────────
  let provider;
  try {
    provider = createProvider(config);
  } catch (error) {
    // If the config is invalid (e.g., no API key), show a helpful message
    if (error instanceof ConfigError) {
      console.error(chalk.red(`  ✖ ${error.message}`));
      console.error(chalk.dim('  Run "pulse configure" to set up your provider.\n'));
      process.exit(1);
    }
    throw error; // Unknown error — crash
  }

  // ── Step 3: Set up agent tools ──────────────────────────────────
  // The agent tools let the AI read files, search code, run commands, etc.
  const agent = createAgent({ cwd: process.cwd() });

  // ── Step 4: Set up the readline interface ───────────────────────
  // readline is a built-in Node.js module for getting user input
  const readlineInterface = readline.createInterface({
    input: process.stdin,     // Read from keyboard
    output: process.stdout,   // Write to screen
    terminal: true,           // Enable terminal features
    historySize: 100,         // Remember 100 previous commands
    completer: function() {
      return [[], ''];  // Disable tab completion
    }
  });

  // ── Step 5: Create the session object ───────────────────────────
  // This session object is passed around to all the functions.
  // It holds everything Pulse CLI needs to know: config, provider,
  // conversation, tools, etc.
  const session = {
    config: config,                      // Provider settings
    provider: provider,                  // The AI provider instance
    conversation: conversation,          // The current conversation
    readline: readlineInterface,         // The readline interface
    abortController: new AbortController(), // For cancelling responses
    isStreaming: false,                  // Is the AI currently responding?
    multilineMode: false,                // Is multiline input mode on?
    toolRegistry: agent.registry,         // The agent's tools
    toolContext: agent.context            // The agent's context (working directory)
  };

  // ── Step 6: Handle Ctrl+C ───────────────────────────────────────
  readlineInterface.on('SIGINT', function() {
    handleCtrlC(session);
  });

  // ── Step 7: Handle unexpected crashes ───────────────────────────
  process.on('uncaughtException', function(error) {
    console.error(chalk.red(`\n  ✖ ${error.message}\n`));
    try {
      conversation.save();
    } catch (saveError) {
      // Ignore save errors
    }
    process.exit(1);
  });

  // ── Step 8: Show the welcome screen ─────────────────────────────
  console.clear();
  showWelcome(config);

  // If we're resuming a conversation, show the last messages
  if (conversation.messageCount > 0) {
    // Get the last 2 non-system messages
    const lastMessages = conversation.messages.filter(function(msg) {
      return msg.role !== 'system';
    }).slice(-2);

    if (lastMessages.length > 0) {
      console.log(chalk.dim('  ── Resuming previous conversation ──\n'));

      for (const message of lastMessages) {
        const label = message.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
        const preview = message.content.length > 300
          ? message.content.slice(0, 300) + '…'
          : message.content;
        console.log(`  ${label}: ${chalk.dim(preview)}\n`);
      }
    }
  }

  // Show the status line with provider and model info
  console.log(chalk.dim(`  ${config.provider} · ${config.model}  |  /help for commands\n`));

  // ── Step 9: The main loop ───────────────────────────────────────
  // This loop runs forever, getting input and sending it to the AI.
  while (true) {
    // Wait for the user to type something and press Enter
    const userInput = await collectUserInput(session);

    // If the input was empty (just pressed Enter), skip it
    if (!userInput.text) continue;

    // ── Handle slash commands ──────────────────────────────────────
    if (userInput.isCommand) {
      // Extract the command name from "/model gpt-4o" → ["model", "gpt-4o"]
      const parts = userInput.text.slice(1).split(/\s+/);
      const commandName = parts[0].toLowerCase();
      const commandArguments = parts.slice(1);

      // Look up the command in our commands list
      const command = SLASH_COMMANDS[commandName];

      if (command) {
        // Run the command
        try {
          await command.handler(session, commandArguments);
        } catch (error) {
          console.log(chalk.red(`  ✖ ${error.message}\n`));
        }
      } else {
        // Unknown command
        console.log(chalk.red(`  ✖ Unknown command: /${commandName}\n`));
      }

      continue; // Go back to waiting for input
    }

    // ── Handle regular messages ────────────────────────────────────
    // Show the user's message in the chat
    console.log(`  ${chalk.green('You')} ${chalk.dim(`[${session.config.model}]`)}`);

    const messageLines = userInput.text.split('\n');
    for (const line of messageLines) {
      console.log(`  ${line}`);
    }
    console.log();

    // Send the message to the AI and handle the response
    try {
      await processUserMessage(session, userInput.text);
    } catch (error) {
      // If the user cancelled, just continue
      if (error.name === 'AbortError') continue;

      // Show a user-friendly error message
      let errorMessage = error.message;
      if (error.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error: ' + error.message;
      }

      console.log(`  ${chalk.red('✖')} ${chalk.dim(errorMessage)}\n`);
    }
  }
}

// Export for use by src/index.js
module.exports = { startChat };
