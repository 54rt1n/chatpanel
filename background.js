console.log('Background script loaded and running');

// Global state
let currentConversationId = null;
let currentStreamContent = '';
let activePanelTabs = new Set();
let activeStream = null;
let activeStreamTabs = new Set();

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function setCurrentConversationId(id) {
  currentConversationId = id;
  // Broadcast to all panels
  broadcastToPanels({
    action: 'UPDATE_CONVERSATION_ID',
    conversationId: id
  });
}

function broadcastToPanels(message) {
  // console.log('Broadcasting to panels:', Array.from(activePanelTabs));
  activePanelTabs.forEach(async tabId => {
    try {
      // First check if the tab still exists
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        console.log('Tab no longer exists, removing from active panels:', tabId);
        activePanelTabs.delete(tabId);
        return;
      }
      
      // Then try to send the message
      await chrome.tabs.sendMessage(tabId, message).catch(error => {
        // Getting an error here may be expected if the tab is not loaded yet or is not responding
        // console.log('Error sending message to tab:', tabId, error);
        // Only remove the tab if it's a connection error
        if (error.message.includes('Could not establish connection') || 
            error.message.includes('receiving end does not exist')) {
          activePanelTabs.delete(tabId);
        }
        // Otherwise, the tab might just be temporarily unresponsive
      });
    } catch (error) {
      console.error('Error in broadcast to tab:', tabId, error);
    }
  });
}

// Initialize conversation ID when extension starts
chrome.runtime.onStartup.addListener(() => {
  setCurrentConversationId(generateConversationId());
});

// Also initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
  setCurrentConversationId(generateConversationId());
});

// Function to start a new conversation
function startNewConversation() {
  currentStreamContent = ''; // Clear content when starting new conversation
  setCurrentConversationId(generateConversationId());
}

// Initialize conversation ID immediately
setCurrentConversationId(generateConversationId());

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'options',
    title: 'Options',
    contexts: ['action']
  });
  
  chrome.contextMenus.create({
    id: 'history',
    title: 'View History',
    contexts: ['action']
  });
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked for tab:', tab.id);
  
  // Execute script to toggle panel
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: (currentContent, conversationId) => {
      console.log('Panel script executing');
      let panel = document.querySelector('.ai-assistant-panel');
      
      if (!panel) {
        console.log('Creating new panel');
        // Create panel if it doesn't exist
        panel = document.createElement('div');
        panel.className = 'ai-assistant-panel';
        // Set conversation ID from parameter
        panel.dataset.conversationId = conversationId;
        // Set initial display state explicitly
        panel.style.display = 'flex';
        panel.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 350px;
          max-height: 500px;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10000;
          font-family: Arial, sans-serif;
          border: 1px solid #e1e4e8;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        `;

        // Add header with gradient background
        const header = document.createElement('div');
        header.style.cssText = `
          padding: 12px 16px;
          background: linear-gradient(to right, #4CAF50, #45a049);
          border-bottom: 1px solid #e1e4e8;
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: white;
        `;

        const headerTop = document.createElement('div');
        headerTop.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const title = document.createElement('span');
        title.textContent = 'AI Assistant';
        title.style.fontWeight = 'bold';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          gap: 8px;
        `;

        const newConvBtn = document.createElement('button');
        newConvBtn.innerHTML = '⟳';
        newConvBtn.title = 'Start New Conversation';
        newConvBtn.style.cssText = `
          border: none;
          background: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 24px;
          opacity: 0.8;
          transition: opacity 0.2s;
        `;
        newConvBtn.onmouseover = () => newConvBtn.style.opacity = '1';
        newConvBtn.onmouseout = () => newConvBtn.style.opacity = '0.8';
        newConvBtn.onclick = () => {
          console.log('Starting new conversation');
          chrome.runtime.sendMessage({ action: 'START_NEW_CONVERSATION' });
        };

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
          border: none;
          background: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 24px;
          opacity: 0.8;
          transition: opacity 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.8';
        closeBtn.onclick = () => {
          console.log('Panel close button clicked');
          panel.remove(); // Fully remove the panel instead of hiding it
          chrome.runtime.sendMessage({ action: 'LEAVE_PANEL' });
        };

        buttonContainer.appendChild(newConvBtn);
        buttonContainer.appendChild(closeBtn);
        headerTop.appendChild(title);
        headerTop.appendChild(buttonContainer);

        const conversationIdDisplay = document.createElement('div');
        conversationIdDisplay.style.cssText = `
          font-size: 10px;
          opacity: 0.8;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        conversationIdDisplay.title = panel.dataset.conversationId;
        conversationIdDisplay.textContent = panel.dataset.conversationId;

        header.appendChild(headerTop);
        header.appendChild(conversationIdDisplay);

        // Add content area
        const content = document.createElement('div');
        content.className = 'panel-content';
        content.style.cssText = `
          padding: 16px;
          flex-grow: 1;
          overflow-y: auto;
          background-color: white;
          color: #333;
          font-size: 14px;
          line-height: 1.5;
        `;

        // If there's current content, display it
        if (currentContent) {
          content.innerHTML = '';
          const pre = document.createElement('pre');
          pre.style.cssText = `
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            line-height: inherit;
          `;
          pre.innerHTML = currentContent;
          content.appendChild(pre);
        } else {
          content.innerHTML = '<p>Type a message below to chat about this page.</p>';
        }

        // Add loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.style.cssText = `
          padding: 8px 16px;
          background-color: #f8f9fa;
          border-top: 1px solid #e1e4e8;
          color: #666;
          font-size: 12px;
          display: none;
        `;
        loadingIndicator.textContent = 'Processing...';

        // Add chat input area
        const chatArea = document.createElement('div');
        chatArea.className = 'chat-input-area';
        chatArea.style.cssText = `
          padding: 12px;
          background-color: #f8f9fa;
          border-top: 1px solid #e1e4e8;
          display: flex;
          gap: 8px;
        `;

        const chatInput = document.createElement('textarea');
        chatInput.className = 'chat-input';
        chatInput.placeholder = 'Type your message...';
        chatInput.style.cssText = `
          flex-grow: 1;
          padding: 8px;
          border: 1px solid #e1e4e8;
          border-radius: 4px;
          resize: none;
          min-height: 20px;
          max-height: 120px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.4;
          background-color: white;
          color: #333;
        `;

        const sendButton = document.createElement('button');
        sendButton.className = 'chat-send-button';
        sendButton.textContent = 'Send';
        sendButton.style.cssText = `
          padding: 8px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        `;
        sendButton.onmouseover = () => sendButton.style.backgroundColor = '#45a049';
        sendButton.onmouseout = () => sendButton.style.backgroundColor = '#4CAF50';

        // Handle chat input submission
        const handleSubmit = () => {
          const message = chatInput.value.trim();
          if (message) {
            console.log('Dispatching chat message event');
            document.dispatchEvent(new CustomEvent('ai_assistant_chat', {
              detail: {
                message,
                url: window.location.href,
                conversationId: panel.dataset.conversationId
              }
            }));
            chatInput.value = '';
            chatInput.style.height = 'auto';
          }
        };

        // Handle Enter key (with and without Shift)
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });

        sendButton.onclick = handleSubmit;

        chatArea.appendChild(chatInput);
        chatArea.appendChild(sendButton);

        panel.appendChild(header);
        panel.appendChild(content);
        panel.appendChild(loadingIndicator);
        panel.appendChild(chatArea);
        document.body.appendChild(panel);
        console.log('New panel created and added to page');

        // If there's an active stream, add this tab to receive updates
        chrome.runtime.sendMessage({ action: 'JOIN_PANEL' });

        return { created: true, visible: true }; // New panel was created and is visible
      } else {
        console.log('Removing existing panel');
        panel.remove();
        chrome.runtime.sendMessage({ action: 'LEAVE_PANEL' });
        return { created: false, visible: false }; // Panel was removed
      }
    },
    args: [currentStreamContent, currentConversationId]
  });
  
  // Handle panel visibility state
  const panelState = result?.[0]?.result;
  if (panelState?.created || panelState?.visible) {
    // Panel is new or visible, add to active panels
    activePanelTabs.add(tab.id);
    // Send current content if it exists
    if (currentStreamContent) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'STREAM_CONTENT',
        content: currentStreamContent,
        isFirst: true
      });
    }
  } else {
    // Panel was removed, remove from active panels
    activePanelTabs.delete(tab.id);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'options') {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === 'history') {
    chrome.tabs.create({ url: 'history.html' });
  }
});

// Default values
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const DEFAULT_USER_ID = 'default_user';
const DEFAULT_PERSONA_ID = 'default_persona';
const DEFAULT_SYSTEM_MESSAGE = 'You are a helpful assistant that analyzes webpage content.';

// Helper function to get settings from storage
async function getSettings() {
  console.log('Fetching settings from storage');
  const result = await chrome.storage.local.get([
    'apiKey',
    'apiEndpoint',
    'userId',
    'personaId',
    'model',
    'systemMessage',
    'temperature',
    'maxTokens',
    'topP',
    'topK',
    'presencePenalty',
    'frequencyPenalty',
    'repetitionPenalty',
    'minP',
    'stream'
  ]);

  console.log('Settings retrieved:', {
    ...result,
    apiKey: result.apiKey ? '[HIDDEN]' : undefined
  });

  return {
    apiKey: result.apiKey,
    apiEndpoint: result.apiEndpoint || 'http://localhost:8000/',
    userId: result.userId || DEFAULT_USER_ID,
    personaId: result.personaId || DEFAULT_PERSONA_ID,
    model: result.model || DEFAULT_MODEL,
    systemMessage: result.systemMessage || DEFAULT_SYSTEM_MESSAGE,
    temperature: result.temperature !== undefined ? result.temperature : 0.7,
    maxTokens: result.maxTokens,
    topP: result.topP,
    topK: result.topK,
    presencePenalty: result.presencePenalty,
    frequencyPenalty: result.frequencyPenalty,
    repetitionPenalty: result.repetitionPenalty,
    minP: result.minP,
    stream: result.stream !== undefined ? result.stream : true
  };
}

// Update processStream to maintain current content
async function processStream(reader) {
  let isFirst = true;
  const decoder = new TextDecoder();
  console.log('Starting to process stream');
  currentStreamContent = ''; // Reset content at start of new stream
  let collectedContent = '';
  let buffer = ''; // Buffer for incomplete chunks
  
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log('Stream complete');
        // Process any remaining buffer content
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
            if (content) {
              currentStreamContent += content;
              collectedContent += content;
              broadcastToPanels({
                action: 'STREAM_CONTENT',
                content,
                isFirst
              });
              isFirst = false;
            }
          } catch (e) {
            console.warn('Error processing final buffer:', e);
          }
        }
        break;
      }
      
      const chunk = decoder.decode(value);
      buffer += chunk;
      const lines = buffer.split('\n');
      
      // Keep the last line in the buffer if it's incomplete
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim() || line.includes('[DONE]')) continue;
        
        try {
          const jsonStr = line.replace(/^data: /, '').trim();
          if (!jsonStr) continue;
          
          const data = JSON.parse(jsonStr);
          const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
          if (!content) continue;
          
          currentStreamContent += content;
          collectedContent += content;
          
          broadcastToPanels({
            action: 'STREAM_CONTENT',
            content,
            isFirst
          });
          
          isFirst = false;
        } catch (e) {
          console.warn('Error parsing streaming data:', e, 'Line:', line);
          // Don't break the stream on parse errors
          continue;
        }
      }
    }
    return collectedContent;
  } catch (error) {
    console.error('Error processing stream:', error);
    broadcastToPanels({
      action: 'SHOW_ERROR',
      error: 'Error processing response stream: ' + error.message
    });
    throw error;
  } finally {
    console.log('Stream processing complete, hiding loading indicator');
    broadcastToPanels({ action: 'HIDE_LOADING' });
    activeStream = null;
    activeStreamTabs.clear();
  }
}

// Function to call the AI endpoint
async function callAIEndpoint(pageData, tabId) {
  console.log('Calling AI endpoint with data:', {
    url: pageData.url,
    title: pageData.title,
    textLength: pageData.text?.length
  });

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('API key not found. Please set it in the options page.');
    }
    if (!settings.apiEndpoint) {
      throw new Error('API endpoint not configured. Please set it in the options page.');
    }

    console.log('Showing loading indicator');
    chrome.tabs.sendMessage(tabId, { action: 'SHOW_LOADING' });

    const messages = [{
      role: 'user',
      content: `Please analyze this webpage:\nURL: ${pageData.url}\nTitle: ${pageData.title}\nContent: ${pageData.text}`,
      timestamp: Date.now()
    }];

    const requestBody = {
      messages,
      metadata: {
        user_id: settings.userId,
        persona_id: settings.personaId,
        workspace_content: pageData.text,
        thought_content: null
      },
      model: settings.model,
      temperature: settings.temperature,
      stream: settings.stream,
      system_message: settings.systemMessage
    };

    // Add optional parameters
    if (settings.maxTokens) requestBody.max_tokens = settings.maxTokens;
    if (settings.topP) requestBody.top_p = settings.topP;
    if (settings.topK) requestBody.top_k = settings.topK;
    if (settings.presencePenalty) requestBody.presence_penalty = settings.presencePenalty;
    if (settings.frequencyPenalty) requestBody.frequency_penalty = settings.frequencyPenalty;
    if (settings.repetitionPenalty) requestBody.repetition_penalty = settings.repetitionPenalty;
    if (settings.minP) requestBody.min_p = settings.minP;

    console.log('Making API request to:', settings.apiEndpoint);
    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error('API request failed:', response.status, response.statusText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    console.log('API request successful');
    if (settings.stream) {
      console.log('Processing streaming response');
      // Add this tab to active stream tabs
      activeStreamTabs.add(tabId);
      
      if (!activeStream) {
        // Start new stream if none exists
        activeStream = response.body.getReader();
        processStream(activeStream);
      }
    } else {
      console.log('Processing non-streaming response');
      const data = await response.json();
      chrome.tabs.sendMessage(tabId, {
        action: 'STREAM_CONTENT',
        content: data.choices[0].message.content,
        isFirst: true
      });
      chrome.tabs.sendMessage(tabId, { action: 'HIDE_LOADING' });
    }

    return { success: true };
  } catch (error) {
    console.error('Error calling AI endpoint:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_ERROR',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

// Function to store a message in history
async function storeMessage(message, response, url, title, conversationId) {
  const timestamp = Date.now();
  const historyEntry = {
    timestamp,
    url,
    title,
    message,
    response,
    conversationId
  };
  
  try {
    // Get existing history
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    
    // Add new entry
    const updatedHistory = [...messageHistory, historyEntry];
    
    // Keep only the last 100 messages to prevent storage issues
    const trimmedHistory = updatedHistory.slice(-100);
    
    // Store updated history
    await chrome.storage.local.set({ 
      messageHistory: trimmedHistory,
      lastMessage: historyEntry // Store last message separately for quick access
    });
    
    console.log('Stored message in history. Total messages:', trimmedHistory.length);
    return historyEntry;
  } catch (error) {
    console.error('Error storing message history:', error);
    throw error; // Re-throw to be handled by caller
  }
}

// Function to get conversation messages
async function getConversationMessages(conversationId) {
  try {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    
    // Filter and sort messages for this conversation
    const conversationMessages = messageHistory
      .filter(msg => msg.conversationId === conversationId)
      .map(msg => ({
        role: msg.response ? 'assistant' : 'user',
        content: msg.response || msg.message,
        timestamp: msg.timestamp
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`Retrieved ${conversationMessages.length} messages for conversation ${conversationId}`);
    return conversationMessages;
  } catch (error) {
    console.error('Error retrieving conversation messages:', error);
    return []; // Return empty array on error to allow conversation to continue
  }
}

// Add function to clear conversation history
async function clearConversationHistory(conversationId) {
  try {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    
    // Filter out messages from the specified conversation
    const updatedHistory = messageHistory.filter(msg => msg.conversationId !== conversationId);
    
    await chrome.storage.local.set({ 
      messageHistory: updatedHistory,
      lastMessage: updatedHistory[updatedHistory.length - 1] || null
    });
    
    console.log(`Cleared history for conversation ${conversationId}`);
    return true;
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    return false;
  }
}

// Function to handle chat messages
async function handleChatMessage(message, url, pageContent, title, tabId, conversationId) {
  console.log('Handling chat message:', { 
    messageLength: message.length, 
    url,
    title,
    pageContentLength: pageContent?.length,
    conversationId
  });
  
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('API key not found. Please set it in the options page.');
    }
    if (!settings.apiEndpoint) {
      throw new Error('API endpoint not configured. Please set it in the options page.');
    }

    console.log('Showing loading indicator');
    chrome.tabs.sendMessage(tabId, { action: 'SHOW_LOADING' });

    // Get previous messages in this conversation
    const conversationMessages = await getConversationMessages(conversationId);
    
    // Add current message
    const messages = [
      ...conversationMessages,
      {
        role: 'user',
        content: message,
        timestamp: Date.now()
      }
    ];

    const workspaceContent = "URL: " + url + "\nTitle: " + title + "\nContent: " + pageContent;

    const requestBody = {
      messages,
      metadata: {
        user_id: settings.userId,
        persona_id: settings.personaId,
        workspace_content: workspaceContent,
        thought_content: null,
        conversation_id: conversationId
      },
      model: settings.model,
      temperature: settings.temperature,
      stream: settings.stream,
      system_message: settings.systemMessage
    };

    // Add optional parameters
    if (settings.maxTokens) requestBody.max_tokens = settings.maxTokens;
    if (settings.topP) requestBody.top_p = settings.topP;
    if (settings.topK) requestBody.top_k = settings.topK;
    if (settings.presencePenalty) requestBody.presence_penalty = settings.presencePenalty;
    if (settings.frequencyPenalty) requestBody.frequency_penalty = settings.frequencyPenalty;
    if (settings.repetitionPenalty) requestBody.repetition_penalty = settings.repetitionPenalty;
    if (settings.minP) requestBody.min_p = settings.minP;

    console.log('Making chat API request to:', settings.apiEndpoint);
    const uri = settings.apiEndpoint + '/v1/chat/completions';
    const response = await fetch(uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error('Chat API request failed:', response.status, response.statusText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    console.log('Chat API request successful');
    let fullResponse = '';
    
    if (settings.stream) {
      console.log('Processing streaming response');
      // Add this tab to active stream tabs
      activeStreamTabs.add(tabId);
      
      // Always create a new stream for chat messages
      if (activeStream) {
        try {
          await activeStream.cancel();
        } catch (e) {
          console.warn('Error canceling previous stream:', e);
        }
      }
      
      activeStream = response.body.getReader();
      try {
        fullResponse = await processStream(activeStream);
      } catch (error) {
        console.error('Error processing stream:', error);
        throw error;
      }
    } else {
      console.log('Processing non-streaming response');
      const data = await response.json();
      fullResponse = data.choices[0].message.content;
      
      chrome.tabs.sendMessage(tabId, {
        action: 'STREAM_CONTENT',
        content: fullResponse,
        isFirst: true
      });
      chrome.tabs.sendMessage(tabId, { action: 'HIDE_LOADING' });
    }

    // Store the message and response
    await storeMessage(message, fullResponse, url, title, conversationId);
    return { success: true };
  } catch (error) {
    console.error('Error in chat handler:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_ERROR',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

// Update message listener to handle panel actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'JOIN_PANEL') {
    const tabId = sender.tab?.id;
    if (tabId) {
      activePanelTabs.add(tabId);
      // Send current content immediately if it exists
      if (currentStreamContent) {
        chrome.tabs.sendMessage(tabId, {
          action: 'STREAM_CONTENT',
          content: currentStreamContent,
          isFirst: true
        });
      }
    }
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'LEAVE_PANEL') {
    const tabId = sender.tab?.id;
    if (tabId) {
      activePanelTabs.delete(tabId);
    }
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'START_NEW_CONVERSATION') {
    console.log('Starting new conversation');
    const oldConversationId = currentConversationId;
    startNewConversation();
    // Clear content in all panels
    broadcastToPanels({
      action: 'STREAM_CONTENT',
      content: '',
      isFirst: true
    });
    // Clear old conversation history if it exists
    if (oldConversationId) {
      clearConversationHistory(oldConversationId)
        .catch(error => console.error('Error clearing old conversation:', error));
    }
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'ANALYZE_PAGE') {
    console.log('Starting page analysis');
    // Use the explicitly passed tabId from the popup, or fall back to sender.tab.id for content script messages
    const tabId = request.tabId || (sender.tab && sender.tab.id);
    if (!tabId) {
      console.error('No tab ID available for analysis');
      sendResponse({ success: false, error: 'No tab ID available' });
      return false; // No async response needed
    }
    
    // Create a Promise race between our operation and a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), 240000) // 4 minute timeout
    );

    Promise.race([
      callAIEndpoint(request.data, tabId),
      timeoutPromise
    ])
      .then(response => {
        console.log('Analysis complete:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in message handler:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  else if (request.action === 'CHAT_MESSAGE') {
    console.log('Handling chat message');
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.error('No tab ID available for chat');
      sendResponse({ success: false, error: 'No tab ID available' });
      return false; // No async response needed
    }

    // Ensure sending tab is in active panels
    activePanelTabs.add(tabId);

    // Create a Promise race between our operation and a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), 240000) // 4 minute timeout
    );

    Promise.race([
      handleChatMessage(
        request.data.message,
        request.data.url,
        request.data.pageContent,
        request.data.title,
        tabId,
        request.data.conversationId
      ),
      timeoutPromise
    ])
      .then(response => {
        console.log('Chat handling complete:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in chat handler:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});

// Add cleanup listeners for tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('Tab removed, cleaning up panel:', tabId);
  activePanelTabs.delete(tabId);
  activeStreamTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    console.log('Tab navigating, cleaning up panel:', tabId);
    activePanelTabs.delete(tabId);
    activeStreamTabs.delete(tabId);
  }
}); 