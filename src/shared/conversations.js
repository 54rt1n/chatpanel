/**
 * Conversation Management Module
 * 
 * Handles message storage, retrieval, and conversation history management
 */

class ConversationManager {
  constructor(storageManager) {
    this.storage = storageManager;
    this.initialized = false;
    this.conversationCache = new Map();
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
          timestamp: msg.timestamp
        }];
        
        // Only add assistant message if there was a response
        if (msg.response) {
          messages.push({
            role: 'assistant',
            content: msg.response,
            timestamp: msg.timestamp + 1 // Ensure assistant message comes after user message
          });
        }
        
        return messages;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Cache the result
    this.conversationCache.set(conversationId, messages);
    
    console.log(`Retrieved ${messages.length} messages for conversation ${conversationId}`);
    return messages;
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
        url: firstMessage.url,
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
  async storeMessage(message, response, url, title, conversationId, agentId) {
    const timestamp = Date.now();
    const historyEntry = {
      timestamp,
      url,
      title,
      message,
      response,
      conversationId,
      agentId
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
      
      // Find first message for title information
      const firstHistoryEntry = messageHistory.find(msg => msg.conversationId === conversationId);
      
      const exportData = {
        id: conversationId,
        title: firstHistoryEntry?.title || 'Exported Conversation',
        url: firstHistoryEntry?.url || '',
        timestamp: firstHistoryEntry?.timestamp || Date.now(),
        agentId: firstHistoryEntry?.agentId || '',
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
      const newConversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      // Create history entries for each message pair
      const newEntries = [];
      for (let i = 0; i < exportData.messages.length; i += 2) {
        const userMessage = exportData.messages[i];
        const assistantMessage = exportData.messages[i + 1];
        
        if (userMessage && userMessage.role === 'user') {
          newEntries.push({
            timestamp: userMessage.timestamp || Date.now() + i,
            url: exportData.url || '',
            title: exportData.title || 'Imported Conversation',
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
        url: firstMessage.url,
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
}

export default ConversationManager;