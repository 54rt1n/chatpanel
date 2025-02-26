/**
 * Additional agent-related message handlers for the message router.
 * 
 * These functions should be added to the message-router.js file.
 */

/**
 * Handle get agent request
 */
handleGetAgent(request, sender, sendResponse) {
  const { agentId } = request;
  
  try {
    const agent = this.agents.getAgent(agentId);
    if (!agent) {
      sendResponse({ success: false, error: 'Agent not found' });
      return true;
    }
    
    sendResponse({ success: true, data: agent });
  } catch (error) {
    console.error('Error getting agent:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle add agent request
 */
handleAddAgent(request, sender, sendResponse) {
  const { config } = request;
  
  try {
    this.agents.addAgent(config)
      .then(agent => {
        sendResponse({ success: true, agent });
      })
      .catch(error => {
        console.error('Error adding agent:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in add agent handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle update agent request
 */
handleUpdateAgent(request, sender, sendResponse) {
  const { agentId, updates } = request;
  
  try {
    this.agents.updateAgent(agentId, updates)
      .then(agent => {
        if (!agent) {
          sendResponse({ success: false, error: 'Agent not found' });
          return;
        }
        
        sendResponse({ success: true, agent });
      })
      .catch(error => {
        console.error('Error updating agent:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in update agent handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle remove agent request
 */
handleRemoveAgent(request, sender, sendResponse) {
  const { agentId } = request;
  
  try {
    this.agents.removeAgent(agentId)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error removing agent:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in remove agent handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle get conversations request
 */
handleGetConversations(request, sender, sendResponse) {
  const { agentId } = request;
  
  try {
    if (agentId) {
      // Get conversations for a specific agent
      this.conversations.getAgentConversations(agentId)
        .then(conversations => {
          sendResponse({ success: true, conversations });
        })
        .catch(error => {
          console.error('Error getting agent conversations:', error);
          sendResponse({ success: false, error: error.message });
        });
    } else {
      // Get all conversations
      this.conversations.getAllConversations()
        .then(conversations => {
          sendResponse({ success: true, conversations });
        })
        .catch(error => {
          console.error('Error getting all conversations:', error);
          sendResponse({ success: false, error: error.message });
        });
    }
  } catch (error) {
    console.error('Error in get conversations handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle get conversation messages request
 */
handleGetConversationMessages(request, sender, sendResponse) {
  const { conversationId } = request;
  
  try {
    this.conversations.getConversationMessages(conversationId)
      .then(messages => {
        sendResponse({ success: true, messages });
      })
      .catch(error => {
        console.error('Error getting conversation messages:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in get conversation messages handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle delete conversation request
 */
handleDeleteConversation(request, sender, sendResponse) {
  const { conversationId } = request;
  
  try {
    this.conversations.clearConversationHistory(conversationId)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error deleting conversation:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in delete conversation handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle export conversation request
 */
handleExportConversation(request, sender, sendResponse) {
  const { conversationId } = request;
  
  try {
    this.conversations.exportConversation(conversationId)
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('Error exporting conversation:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in export conversation handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}

/**
 * Handle import conversation request
 */
handleImportConversation(request, sender, sendResponse) {
  const { data, agentId } = request;
  
  try {
    this.conversations.importConversation(data, agentId)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        console.error('Error importing conversation:', error);
        sendResponse({ success: false, error: error.message });
      });
  } catch (error) {
    console.error('Error in import conversation handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
}
