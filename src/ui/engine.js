const chalk = require('chalk');

function detectToolCalls(aiResponseText) {
  // copied from chat.js
  const detectedCalls = [];
  try {
    const parsedJSON = JSON.parse(aiResponseText);
    if (parsedJSON.tool) {
      const params = {};
      for (const key of Object.keys(parsedJSON)) {
        if (key !== 'tool') {
          params[key] = parsedJSON[key];
        }
      }
      detectedCalls.push({ name: parsedJSON.tool, params: params });
    }
    if (parsedJSON.name && parsedJSON.params) {
      detectedCalls.push({ name: parsedJSON.name, params: parsedJSON.params });
    }
    if (Array.isArray(parsedJSON)) {
      for (const item of parsedJSON) {
        if (item.tool) {
          detectedCalls.push({ name: item.tool, params: item });
        }
      }
    }
    if (detectedCalls.length > 0) return detectedCalls;
  } catch (parseError) {}

  const xmlPattern = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let xmlMatch;
  while ((xmlMatch = xmlPattern.exec(aiResponseText)) !== null) {
    const toolName = xmlMatch[1];
    const toolBody = xmlMatch[2];
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

async function processUserMessageInk(session, userMessage, onUpdate) {
  session.conversation.addMessage('user', userMessage);
  session.conversation.deriveTitle(userMessage);

  const abortController = new AbortController();
  session.abortController = abortController;
  session.isStreaming = true;

  onUpdate(session.conversation.messages.filter(m => m.role !== 'system'));

  const messagesForAI = session.conversation.messages.map(msg => ({ role: msg.role, content: msg.content }));

  let finalResponseText = '';

  for (let roundNumber = 0; roundNumber < 10; roundNumber++) {
    if (abortController.signal.aborted) {
      session.isStreaming = false;
      return;
    }

    let aiResponse;
    try {
      aiResponse = await session.provider.chatComplete(messagesForAI, abortController.signal);
    } catch (error) {
      session.conversation.addMessage('assistant', `[Error: ${error.message}]`);
      onUpdate(session.conversation.messages.filter(m => m.role !== 'system'));
      session.isStreaming = false;
      return;
    }

    const aiText = (aiResponse.content || '').trim();
    if (aiText === '') {
      session.isStreaming = false;
      return;
    }

    const toolCalls = detectToolCalls(aiText);

    if (toolCalls.length === 0) {
      session.conversation.addMessage('assistant', aiText);
      try { await session.conversation.save(); } catch (e) {}
      onUpdate(session.conversation.messages.filter(m => m.role !== 'system'));
      session.isStreaming = false;
      return;
    }

    const toolResults = [];
    for (const toolCall of toolCalls) {
      try {
        const toolResult = await session.toolRegistry.execute(toolCall.name, toolCall.params, session.toolContext);
        let resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
        toolResults.push({ role: 'user', content: `[Tool ${toolCall.name} result]\n${resultText}` });
        session.conversation.addMessage('assistant', `[Calling tool ${toolCall.name}]`);
        session.conversation.addMessage('user', `[Tool result: ${resultText.substring(0, 50)}...]`);
        onUpdate(session.conversation.messages.filter(m => m.role !== 'system'));
      } catch (toolError) {
        toolResults.push({ role: 'user', content: `[Tool ${toolCall.name} error]\n${toolError.message}` });
      }
    }

    messagesForAI.push({ role: 'assistant', content: aiText });
    for (const result of toolResults) {
      messagesForAI.push(result);
    }
  }

  session.isStreaming = false;
  
  try {
    let hasReceivedAnyContent = false;
    const streamMessages = session.conversation.messages.map(msg => ({ role: msg.role, content: msg.content }));
    
    // Create a temporary message in the session for streaming updates
    session.conversation.addMessage('assistant', '');
    const tempIndex = session.conversation.messages.length - 1;

    for await (const chunk of session.provider.streamChat(streamMessages, abortController.signal)) {
      if (chunk) {
        finalResponseText += chunk;
        session.conversation.messages[tempIndex].content = finalResponseText;
        onUpdate([...session.conversation.messages.filter(m => m.role !== 'system')]);
      }
    }

    if (finalResponseText) {
      try { await session.conversation.save(); } catch (e) {}
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      session.conversation.addMessage('assistant', `[Streaming Error: ${error.message}]`);
      onUpdate(session.conversation.messages.filter(m => m.role !== 'system'));
    }
  }
}

module.exports = { processUserMessageInk, detectToolCalls };
