import api from './api.js';
import logger from './logger.js';
import { panelManager } from './panelManager.js';

logger.info('Background script loaded and running');

// Initialize panel manager
panelManager.initialize().then(() => {
  logger.info('Panel manager initialized successfully');
}).catch(error => {
  logger.error('Failed to initialize panel manager:', error);
});

// Initialize conversation ID when extension starts
chrome.runtime.onStartup.addListener(() => {
  logger.info('Extension starting up');
  logger.logSystemInfo();
  // Panel manager is already initialized
});

// Also initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed/updated');
  logger.logSystemInfo();
  // Panel manager is already initialized
});

// Function to start a new conversation
function startNewConversation() {
  logger.info('Starting new conversation');
  const startTime = Date.now();
  panelManager.startNewConversation();
  logger.logPerformance('startNewConversation', Date.now() - startTime);
}

// Initialize conversation ID immediately
panelManager.startNewConversation();

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

  chrome.contextMenus.create({
    id: 'debug',
    title: 'Debug Panel',
    contexts: ['action']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'options') {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === 'history') {
    chrome.tabs.create({ url: 'history.html' });
  } else if (info.menuItemId === 'debug') {
    chrome.tabs.create({ url: 'debug.html' });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked for tab:', tab.id);
  logger.info('Extension icon clicked', { tabId: tab.id, url: tab.url });
  
  try {
    // Toggle panel visibility using panel manager
    const isVisible = panelManager.visibilityState.get(tab.id) || false;
    logger.debug('Current panel visibility:', { tabId: tab.id, isVisible });
    
    await panelManager.setPanelVisibility(tab.id, !isVisible);
    logger.info('Panel visibility toggled successfully', { tabId: tab.id, newVisibility: !isVisible });
  } catch (error) {
    logger.error('Failed to toggle panel visibility:', error);
  }
});

// Default values
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const DEFAULT_USER_ID = 'default_user';
const DEFAULT_PERSONA_ID = 'default_persona';
const DEFAULT_SYSTEM_MESSAGE = 'You are a helpful assistant that analyzes webpage content.';
const DEFAULT_API_ENDPOINT = 'http://localhost:8000';

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

  // Normalize API endpoint by removing trailing slash
  const apiEndpoint = (result.apiEndpoint || DEFAULT_API_ENDPOINT).replace(/\/$/, '');

  console.log('Settings retrieved:', {
    ...result,
    apiKey: result.apiKey ? '[HIDDEN]' : undefined,
    apiEndpoint
  });

  return {
    apiKey: result.apiKey,
    apiEndpoint,
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

// Update processStream to use panelManager
async function processStream(reader) {
  let isFirst = true;
  const decoder = new TextDecoder();
  logger.info('Starting to process stream');
  let buffer = '';
  let collectedContent = '';
  
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        logger.debug('Stream complete');
        // Process any remaining buffer content
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
            if (content) {
              collectedContent += content;
              await panelManager.updateContent(content, isFirst);
              isFirst = false;
            }
          } catch (e) {
            logger.warn('Error processing final buffer:', e);
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
          
          collectedContent += content;
          await panelManager.updateContent(content, isFirst);
          isFirst = false;
        } catch (e) {
          logger.warn('Error parsing streaming data:', e, 'Line:', line);
          continue;
        }
      }
    }
    return collectedContent;
  } catch (error) {
    logger.error('Error processing stream:', error);
    panelManager.broadcastToAllPanels({
      action: 'SHOW_ERROR',
      error: 'Error processing response stream: ' + error.message
    });
    throw error;
  } finally {
    await panelManager.cancelStream();
  }
}

// Update callAIEndpoint to use stream management
async function callAIEndpoint(pageData, tabId) {
  logger.info('Calling AI endpoint with data:', {
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

    logger.debug('Showing loading indicator');
    chrome.tabs.sendMessage(tabId, { action: 'SHOW_LOADING' });

    const messages = [{
      role: 'user',
      content: `Please analyze this webpage:\nURL: ${pageData.url}\nTitle: ${pageData.title}\nContent: ${pageData.text}`,
      timestamp: Date.now()
    }];

    const metadata = {
      user_id: settings.userId,
      persona_id: settings.personaId,
      workspace_content: pageData.text,
      thought_content: null,
      model: settings.model,
      temperature: settings.temperature,
      stream: settings.stream,
      system_message: settings.systemMessage
    };

    // Add optional parameters
    if (settings.maxTokens) metadata.max_tokens = settings.maxTokens;
    if (settings.topP) metadata.top_p = settings.topP;
    if (settings.topK) metadata.top_k = settings.topK;
    if (settings.presencePenalty) metadata.presence_penalty = settings.presencePenalty;
    if (settings.frequencyPenalty) metadata.frequency_penalty = settings.frequencyPenalty;
    if (settings.repetitionPenalty) metadata.repetition_penalty = settings.repetitionPenalty;
    if (settings.minP) metadata.min_p = settings.minP;

    logger.info('Making API request');
    const response = await api.chatCompletion(messages, metadata);

    logger.info('API request successful');
    if (settings.stream) {
      logger.debug('Processing streaming response');
      await panelManager.startStream(response.body.getReader(), tabId);
      await processStream(panelManager.activeStream);
    } else {
      logger.debug('Processing non-streaming response');
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
    logger.error('Error calling AI endpoint:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_ERROR',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

// Function to store a message in history
async function storeMessage(message, response, url, title, conversationId) {
  const startTime = Date.now();
  const timestamp = Date.now();
  const historyEntry = {
    timestamp,
    url,
    title,
    message,
    response,
    conversationId,
    saved: false  // Track if this message has been saved to API
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
    
    logger.info('Message stored in history', {
      messageId: timestamp,
      conversationId,
      historySize: trimmedHistory.length
    });
    logger.logPerformance('storeMessage', Date.now() - startTime);
    return historyEntry;
  } catch (error) {
    logger.error('Error storing message history:', error);
    throw error; // Re-throw to be handled by caller
  }
}

// Function to mark a message as saved
async function markMessageAsSaved(timestamp) {
  const startTime = Date.now();
  try {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    const updatedHistory = messageHistory.map(msg => {
      if (msg.timestamp === timestamp) {
        return { ...msg, saved: true };
      }
      return msg;
    });
    
    await chrome.storage.local.set({ 
      messageHistory: updatedHistory,
      lastMessage: updatedHistory[updatedHistory.length - 1]
    });
    
    logger.info('Message marked as saved', { messageId: timestamp });
    logger.logPerformance('markMessageAsSaved', Date.now() - startTime);
    return true;
  } catch (error) {
    logger.error('Error marking message as saved:', error);
    return false;
  }
}

// Function to get conversation messages
async function getConversationMessages(conversationId) {
  const startTime = Date.now();
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
    
    logger.info('Retrieved conversation messages', {
      conversationId,
      messageCount: conversationMessages.length
    });
    logger.logPerformance('getConversationMessages', Date.now() - startTime);
    return conversationMessages;
  } catch (error) {
    logger.error('Error retrieving conversation messages:', error);
    return []; // Return empty array on error to allow conversation to continue
  }
}

// Add function to clear conversation history
async function clearConversationHistory(conversationId) {
  const startTime = Date.now();
  try {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    
    // Filter out messages from the specified conversation
    const updatedHistory = messageHistory.filter(msg => msg.conversationId !== conversationId);
    
    await chrome.storage.local.set({ 
      messageHistory: updatedHistory,
      lastMessage: updatedHistory[updatedHistory.length - 1] || null
    });
    
    logger.info('Cleared conversation history', {
      conversationId,
      removedMessages: messageHistory.length - updatedHistory.length
    });
    logger.logPerformance('clearConversationHistory', Date.now() - startTime);
    return true;
  } catch (error) {
    logger.error('Error clearing conversation history:', error);
    return false;
  }
}

// Update handleChatMessage to use stream management
async function handleChatMessage(message, url, pageContent, title, tabId, conversationId) {
  logger.info('Handling chat message:', { 
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

    logger.debug('Showing loading indicator');
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

    const metadata = {
      user_id: settings.userId,
      persona_id: settings.personaId,
      url: url,
      title: title,
      workspace_content: pageContent,
      thought_content: null,
      conversation_id: conversationId,
      model: settings.model,
      temperature: settings.temperature,
      stream: settings.stream,
      system_message: settings.systemMessage
    };

    // Add optional parameters
    if (settings.maxTokens) metadata.max_tokens = settings.maxTokens;
    if (settings.topP) metadata.top_p = settings.topP;
    if (settings.topK) metadata.top_k = settings.topK;
    if (settings.presencePenalty) metadata.presence_penalty = settings.presencePenalty;
    if (settings.frequencyPenalty) metadata.frequency_penalty = settings.frequencyPenalty;
    if (settings.repetitionPenalty) metadata.repetition_penalty = settings.repetitionPenalty;
    if (settings.minP) metadata.min_p = settings.minP;

    logger.info('Making chat API request');
    const response = await api.chatCompletion(messages, metadata);

    logger.info('Chat API request successful');
    let fullResponse = '';
    
    if (settings.stream) {
      logger.debug('Processing streaming response');
      await panelManager.startStream(response.body.getReader(), tabId);
      try {
        fullResponse = await processStream(panelManager.activeStream);
      } catch (error) {
        logger.error('Error processing stream:', error);
        throw error;
      }
    } else {
      logger.debug('Processing non-streaming response');
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
    const historyEntry = await storeMessage(message, fullResponse, url, title, conversationId);
    
    // Try to save to API
    try {
      await api.saveConversation(conversationId, messages);
      await markMessageAsSaved(historyEntry.timestamp);
    } catch (error) {
      logger.warn('Failed to save conversation to API:', error);
      // Don't throw error here, as the chat functionality should continue to work
    }
    
    return { success: true };
  } catch (error) {
    logger.error('Error in chat handler:', error);
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
      panelManager.setPanelVisibility(tabId, true).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logger.error('Error joining panel:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true;
  }
  else if (request.action === 'LEAVE_PANEL') {
    const tabId = sender.tab?.id;
    if (tabId) {
      panelManager.setPanelVisibility(tabId, false).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logger.error('Error leaving panel:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true;
  }
  else if (request.action === 'MARK_MESSAGE_SAVED') {
    markMessageAsSaved(request.timestamp)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error marking message as saved:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  else if (request.action === 'START_NEW_CONVERSATION') {
    console.log('Starting new conversation');
    startNewConversation();
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'ANALYZE_PAGE') {
    console.log('Starting page analysis');
    const tabId = request.tabId || (sender.tab && sender.tab.id);
    if (!tabId) {
      console.error('No tab ID available for analysis');
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }
    
    callAIEndpoint(request.data, tabId)
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
    logger.info('Handling chat message');
    const tabId = sender.tab?.id;
    if (!tabId) {
      logger.error('No tab ID available for chat');
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }

    handleChatMessage(
      request.data.message,
      request.data.url,
      request.data.pageContent,
      request.data.title,
      tabId,
      panelManager.currentConversationId
    )
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
  else if (request.action === 'SAVE_PANEL_STATE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      panelManager.setPanelVisibility(tabId, request.isVisible).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logger.error('Error saving panel state:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true;
  }
  else if (request.action === 'UPDATE_PANEL_VISIBILITY') {
    const tabId = sender.tab?.id;
    if (tabId) {
      panelManager.setPanelVisibility(tabId, request.isVisible).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logger.error('Error updating panel visibility:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true;
  }
}); 

