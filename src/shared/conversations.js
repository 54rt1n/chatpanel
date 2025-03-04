/**
 * Conversation Management Module
 * 
 * Handles message storage, retrieval, and conversation history management
 */

class ConversationManager {
  constructor(storageManager, apiClient) {
    this.storage = storageManager;
    this.api = apiClient;
    this.initialized = false;
    this.MAX_CACHE_SIZE = 20; // Maximum number of conversations to cache
    this.conversationCache = new Map();
    this.cacheOrder = []; // Track LRU cache order
  }

  /**
   * Initialize the conversation manager
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('ConversationManager initialized');
  }

  /**
   * Get all messages for a specific conversation
   */
  async getConversationMessages(conversationId) {
    // Check cache first
    if (this.conversationCache.has(conversationId)) {
      // Update cache order (move to front of LRU)
      this.updateCacheOrder(conversationId);
      return this.conversationCache.get(conversationId);
    }
    
    const data = await this.storage.get('messageHistory', []);
    const messageHistory = data.messageHistory || [];
    
    // Filter and format messages for this conversation
    const messages = messageHistory
      .filter(msg => msg.conversationId === conversationId)
      .flatMap(msg => {
        const messages = [{
          role: 'user',
          content: msg.message,
          timestamp: parseInt(msg.timestamp, 10), // Ensure timestamp is a number
          url: msg.url,
          title: msg.title,
          model: msg.model,
          saved: msg.saved || false
        }];
        
        // Only add assistant message if there was a response
        if (msg.response) {
          messages.push({
            role: 'assistant',
            content: msg.response,
            timestamp: parseInt(msg.timestamp, 10), // Ensure timestamp is a number
            url: msg.url,
            title: msg.title,
            model: msg.model,
            saved: msg.saved || false
          });
        }
        
        return messages;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Add to cache and manage cache size
    this.addToCache(conversationId, messages);
    
    console.log(`Retrieved ${messages.length} messages for conversation ${conversationId}`);
    return messages;
  }

  /**
   * Add a conversation to the cache with LRU management
   * @param {string} conversationId - The conversation ID
   * @param {Array} messages - The conversation messages
   */
  addToCache(conversationId, messages) {
    // Add to cache
    this.conversationCache.set(conversationId, messages);
    
    // Update LRU order
    this.updateCacheOrder(conversationId);
    
    // Enforce cache size limit
    this.enforceCacheLimit();
  }

  /**
   * Update the cache order for LRU tracking
   * @param {string} conversationId - The conversation ID to move to most recent
   */
  updateCacheOrder(conversationId) {
    // Remove from current position if exists
    const currentIndex = this.cacheOrder.indexOf(conversationId);
    if (currentIndex !== -1) {
      this.cacheOrder.splice(currentIndex, 1);
    }
    
    // Add to front (most recently used)
    this.cacheOrder.unshift(conversationId);
  }

  /**
   * Enforce the cache size limit by removing least recently used items
   */
  enforceCacheLimit() {
    while (this.cacheOrder.length > this.MAX_CACHE_SIZE) {
      const oldestId = this.cacheOrder.pop(); // Remove oldest
      this.conversationCache.delete(oldestId);
      console.log(`Removed conversation ${oldestId} from cache due to size limit`);
    }
  }

  /**
   * Get all conversations for a specific agent
   */
  async getAgentConversations(agentId) {
    const data = await this.storage.get('messageHistory', []);
    const messageHistory = data.messageHistory || [];
    
    // Get all conversation IDs for this agent
    const conversationIds = new Set(
      messageHistory
        .filter(msg => msg.agentId === agentId)
        .map(msg => msg.conversationId)
    );
    
    // Group messages by conversation and find first message timestamp
    const conversations = Array.from(conversationIds).map(conversationId => {
      const messages = messageHistory.filter(msg => msg.conversationId === conversationId);
      const firstMessage = messages.reduce((earliest, msg) => 
        msg.timestamp < earliest.timestamp ? msg : earliest, messages[0]);
      
      return {
        id: conversationId,
        agentId,
        title: firstMessage.title || 'Untitled Conversation',
        url: firstMessage.url || '',
        timestamp: firstMessage.timestamp,
        messageCount: messages.length,
        firstMessage: firstMessage.message,
        preview: firstMessage.message.substring(0, 100) + (firstMessage.message.length > 100 ? '...' : '')
      };
    });
    
    // Sort by timestamp (newest first)
    return conversations.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Store a message and its response in history
   */
  async storeMessage(message, response, url, title, conversationId, agentId, model) {
    const timestamp = Math.floor(Date.now() / 1000);
    const historyEntry = {
      timestamp,
      url,
      title,
      message,
      response,
      conversationId,
      agentId,
      model,
      saved: false // Initialize as not saved
    };
    
    try {
      // Get existing history
      const data = await this.storage.get('messageHistory', []);
      const messageHistory = data.messageHistory || [];
      
      // Add new entry
      const updatedHistory = [...messageHistory, historyEntry];
      
      // Keep only the last 500 messages to prevent storage issues
      const trimmedHistory = updatedHistory.slice(-500);
      
      // Store updated history
      await this.storage.set('messageHistory', trimmedHistory);
      await this.storage.set('lastMessage', historyEntry); // Store last message separately for quick access
      
      // Invalidate cache for this conversation
      this.conversationCache.delete(conversationId);
      
      console.log('Stored message in history. Total messages:', trimmedHistory.length);
      return historyEntry;
    } catch (error) {
      console.error('Error storing message history:', error);
      throw error;
    }
  }

  /**
   * Mark a message as saved
   */
  async markMessageAsSaved(messageId, conversationId) {
    try {
      console.log('Marking message as saved:', {
        messageId,
        conversationId
      });

      const data = await this.storage.get('messageHistory', []);
      const messageHistory = data.messageHistory || [];
      
      // Find the message index
      const messageIndex = messageHistory.findIndex(msg => {
        const timestampMatch = parseInt(msg.timestamp, 10) === parseInt(messageId, 10);
        const conversationMatch = msg.conversationId === conversationId;
        console.log('Checking message:', {
          msgTimestamp: msg.timestamp,
          msgConversationId: msg.conversationId,
          timestampMatch,
          conversationMatch
        });
        return timestampMatch && conversationMatch;
      });
      
      if (messageIndex === -1) {
        console.error('Message not found in history:', {
          messageId,
          conversationId,
          historyLength: messageHistory.length,
          timestamps: messageHistory.map(m => m.timestamp),
          conversations: messageHistory.map(m => m.conversationId)
        });
        throw new Error('Message not found');
      }
      
      // Update the message
      const updatedHistory = [
        ...messageHistory.slice(0, messageIndex),
        { ...messageHistory[messageIndex], saved: true },
        ...messageHistory.slice(messageIndex + 1)
      ];
      
      // Store updated history
      await this.storage.set('messageHistory', updatedHistory);
      
      // Update last message if needed
      if (messageHistory[messageHistory.length - 1].timestamp === messageId) {
        await this.storage.set('lastMessage', updatedHistory[updatedHistory.length - 1]);
      }
      
      // Invalidate cache for this conversation
      this.conversationCache.delete(conversationId);
      
      console.log('Successfully marked message as saved');
      return true;
    } catch (error) {
      console.error('Error marking message as saved:', error);
      throw error;
    }
  }

  /**
   * Clear all messages for a conversation
   */
  async clearConversationHistory(conversationId) {
    try {
      const data = await this.storage.get('messageHistory', []);
      const messageHistory = data.messageHistory || [];
      
      // Filter out messages from the specified conversation
      const updatedHistory = messageHistory.filter(msg => msg.conversationId !== conversationId);
      
      await this.storage.set('messageHistory', updatedHistory);
      
      if (updatedHistory.length > 0) {
        await this.storage.set('lastMessage', updatedHistory[updatedHistory.length - 1]);
      } else {
        await this.storage.set('lastMessage', null);
      }
      
      // Invalidate cache
      this.conversationCache.delete(conversationId);
      
      // Remove from cache order
      const orderIndex = this.cacheOrder.indexOf(conversationId);
      if (orderIndex !== -1) {
        this.cacheOrder.splice(orderIndex, 1);
      }
      
      console.log(`Cleared history for conversation ${conversationId}`);
      return true;
    } catch (error) {
      console.error('Error clearing conversation history:', error);
      return false;
    }
  }

/**
 * Export a conversation to a JSON file
 */
async exportConversation(conversationId) {
  try {
    const messages = await this.getConversationMessages(conversationId);
    const data = await this.storage.get('messageHistory', []);
    const messageHistory = data.messageHistory || [];
    
    // Find first message for metadata
    const firstHistoryEntry = messageHistory.find(msg => msg.conversationId === conversationId);
    
    // Get agent information
    let agentInfo = null;
    if (firstHistoryEntry?.agentId) {
      // Try to get agent data from storage
      const agentData = await this.storage.get('agents', []);
      const agents = agentData.agents || [];
      agentInfo = agents.find(a => a.id === firstHistoryEntry.agentId);
    }
    
    const exportData = {
      id: conversationId,
      timestamp: firstHistoryEntry?.timestamp || Date.now(),
      agentId: firstHistoryEntry?.agentId || '',
      agentName: agentInfo?.name || 'Unknown Agent',
      messages: messages
    };
    
    return exportData;
  } catch (error) {
    console.error('Error exporting conversation:', error);
    throw error;
  }
}

/**
 * Import a conversation from an exported JSON file
 */
async importConversation(exportData, newAgentId = null) {
  try {
    const data = await this.storage.get('messageHistory', []);
    const messageHistory = data.messageHistory || [];
    
    // Generate a new conversation ID
    const newConversationId = 'conv_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).substr(2, 9);
    
    // If no agent ID was provided but we have an agent name, try to find the agent
    if (!newAgentId && exportData.agentName) {
      const agentData = await this.storage.get('agents', []);
      const agents = agentData.agents || [];
      
      // Look for agent with matching name
      const matchingAgent = agents.find(a => a.name === exportData.agentName);
      if (matchingAgent) {
        newAgentId = matchingAgent.id;
      }
    }
    
    // Create history entries for each message pair
    const newEntries = [];
    for (let i = 0; i < exportData.messages.length; i += 2) {
      const userMessage = exportData.messages[i];
      const assistantMessage = exportData.messages[i + 1];
      
      if (userMessage && userMessage.role === 'user') {
        newEntries.push({
          timestamp: userMessage.timestamp || Math.floor(Date.now() / 1000) + i,
          url: userMessage.url || '',
          title: userMessage.title || 'Imported Message',
          model: userMessage.model || 'unknown',
          message: userMessage.content,
          response: assistantMessage?.content || '',
          conversationId: newConversationId,
          agentId: newAgentId || exportData.agentId || ''
        });
      }
    }
    
    // Add to history
    const updatedHistory = [...messageHistory, ...newEntries];
    
    // Keep only the last 500 messages
    const trimmedHistory = updatedHistory.slice(-500);
    
    await this.storage.set('messageHistory', trimmedHistory);
    await this.storage.set('lastMessage', trimmedHistory[trimmedHistory.length - 1] || null);
    
    return {
      conversationId: newConversationId,
      messageCount: newEntries.length
    };
  } catch (error) {
    console.error('Error importing conversation:', error);
    throw error;
  }
}
  
  /**
   * Get all conversations
   */
  async getAllConversations() {
    const data = await this.storage.get('messageHistory', []);
    const messageHistory = data.messageHistory || [];
    
    // Get all unique conversation IDs
    const conversationIds = new Set(messageHistory.map(msg => msg.conversationId));
    
    // Group messages by conversation
    const conversations = Array.from(conversationIds).map(conversationId => {
      const messages = messageHistory.filter(msg => msg.conversationId === conversationId);
      const firstMessage = messages.reduce((earliest, msg) => 
        msg.timestamp < earliest.timestamp ? msg : earliest, messages[0]);
      
      return {
        id: conversationId,
        agentId: firstMessage.agentId,
        title: firstMessage.title || 'Untitled Conversation',
        url: firstMessage.url || '',
        timestamp: firstMessage.timestamp,
        messageCount: messages.length,
        lastUpdate: messages.reduce((latest, msg) => 
          msg.timestamp > latest ? msg.timestamp : latest, 0),
        preview: firstMessage.message.substring(0, 100) + (firstMessage.message.length > 100 ? '...' : '')
      };
    });
    
    // Sort by timestamp (newest first)
    return conversations.sort((a, b) => b.lastUpdate - a.lastUpdate);
  }

  /**
   * Delete a specific message from a conversation
   */
  async deleteMessage(messageId, conversationId) {
    try {
      const data = await this.storage.get('messageHistory', []);
      const messageHistory = data.messageHistory || [];
      
      // Find the message index
      const messageIndex = messageHistory.findIndex(msg => 
        msg.timestamp === messageId && msg.conversationId === conversationId
      );
      
      if (messageIndex === -1) {
        throw new Error('Message not found');
      }
      
      // Remove the message
      const updatedHistory = [
        ...messageHistory.slice(0, messageIndex),
        ...messageHistory.slice(messageIndex + 1)
      ];
      
      // Store updated history
      await this.storage.set('messageHistory', updatedHistory);
      
      // Update last message if needed
      if (messageHistory[messageHistory.length - 1].timestamp === messageId) {
        await this.storage.set('lastMessage', updatedHistory[updatedHistory.length - 1] || null);
      }
      
      // Invalidate cache for this conversation
      this.conversationCache.delete(conversationId);
      
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Save a message to the external API
   */
  async saveMessage(message, conversationId) {
    try {
      if (!this.api) {
        throw new Error('API client not initialized');
      }

      const messageTimestamp = parseInt(message.timestamp, 10);
      
      console.log('Saving message to API:', {
        messageTimestamp,
        conversationId,
        messageData: message
      });

      // Get all messages for this conversation
      const allMessages = await this.getConversationMessages(conversationId);
      
      // Find only the user and assistant messages with the matching timestamp
      const messagesToSave = allMessages.filter(msg => 
        parseInt(msg.timestamp, 10) === messageTimestamp
      );

      if (messagesToSave.length === 0) {
        throw new Error('Message pair not found');
      }
      
      // Save only these messages
      const result = await this.api.saveConversation(conversationId, messagesToSave);
      
      // Check if the API call was successful
      if (result.status === 'success') {
        console.log('API save successful, marking message as saved');
        
        // Mark this message as saved
        await this.markMessageAsSaved(messageTimestamp, conversationId);
        return { success: true, data: result };
      } else {
        throw new Error(result.message || 'Failed to save conversation');
      }
    } catch (error) {
      console.error('Error saving message:', error);
      return { success: false, error: error.message };
    }
  }
}

export default ConversationManager;