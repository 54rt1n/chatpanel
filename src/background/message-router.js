/**
 * Message Router
 * 
 * Handles routing of messages from content scripts and other parts of the extension
 */

class MessageRouter {
  constructor(agentManager, conversationManager, apiClient, streamHandler) {
    this.agents = agentManager;
    this.conversations = conversationManager;
    this.api = apiClient;
    this.streamHandler = streamHandler;
    
    // Panel tracking
    this.activePanelTabs = new Set();
  }
  
  /**
   * Handle incoming messages
   */
  handleMessage(request, sender, sendResponse) {
    console.log('Router received message:', request?.action);
    
    // Route message to appropriate handler
    switch (request.action) {
      case 'PING':
        // Simple ping to check connection
        sendResponse({ success: true, timestamp: Date.now() });
        return false;
        
      case 'CHECK_STATUS':
        // Return detailed status of the service worker
        sendResponse({
          success: true,
          status: {
            isActive: true,
            activePanels: this.activePanelTabs.size,
            activeStreams: this.streamHandler.activeStreams.size,
            timestamp: Date.now()
          }
        });
        return false;
        
      case 'JOIN_PANEL':
        return this.handleJoinPanel(request, sender, sendResponse);
        
      case 'LEAVE_PANEL':
        return this.handleLeavePanel(request, sender, sendResponse);
        
      case 'START_NEW_CONVERSATION':
        return this.handleStartNewConversation(request, sender, sendResponse);
        
      case 'SWITCH_AGENT':
        return this.handleSwitchAgent(request, sender, sendResponse);
        
      case 'REJOIN_CONVERSATION':
        return this.handleRejoinConversation(request, sender, sendResponse);
        
      case 'ANALYZE_PAGE':
        return this.handleAnalyzePage(request, sender, sendResponse);
        
      case 'CHAT_MESSAGE':
        return this.handleChatMessage(request, sender, sendResponse);
        
      case 'GET_AGENTS':
        return this.handleGetAgents(request, sender, sendResponse);
        
      case 'GET_AGENT':
        return this.handleGetAgent(request, sender, sendResponse);
        
      case 'ADD_AGENT':
        return this.handleAddAgent(request, sender, sendResponse);
        
      case 'UPDATE_AGENT':
        return this.handleUpdateAgent(request, sender, sendResponse);
        
      case 'REMOVE_AGENT':
        return this.handleRemoveAgent(request, sender, sendResponse);
        
      case 'GET_CONVERSATIONS':
        return this.handleGetConversations(request, sender, sendResponse);
        
      case 'GET_CONVERSATION_MESSAGES':
        return this.handleGetConversationMessages(request, sender, sendResponse);
        
      case 'DELETE_CONVERSATION':
        return this.handleDeleteConversation(request, sender, sendResponse);
        
      case 'EXPORT_CONVERSATION':
        return this.handleExportConversation(request, sender, sendResponse);
        
      case 'IMPORT_CONVERSATION':
        return this.handleImportConversation(request, sender, sendResponse);
        
      case 'DELETE_MESSAGE':
        return this.handleDeleteMessage(request, sender, sendResponse);
        
      case 'SAVE_MESSAGE':
        return this.handleSaveMessage(request, sender, sendResponse);
        
      default:
        console.warn('Unknown message action:', request.action);
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
  }
  
  /**
   * Handle panel join request
   */
  handleJoinPanel(request, sender, sendResponse) {
    const tabId = sender.tab?.id;
    if (tabId) {
      this.activePanelTabs.add(tabId);
      
      // Add to agent stream tabs
      const agentId = request.agentId || this.agents.getActiveAgent().id;
      this.streamHandler.addTabToAgentStream(agentId, tabId);
      
      // Send agent tabs to this panel - Using try/catch to handle potential errors
      try {
        // Send message but don't wait for it before sending response
        chrome.tabs.sendMessage(tabId, {
          action: 'UPDATE_AGENT_TABS',
          agents: this.agents.getAllAgents(),
          activeAgentId: agentId
        }).catch(err => console.error('Error updating agent tabs:', err));
      } catch (error) {
        console.error('Error sending UPDATE_AGENT_TABS message:', error);
      }
    }
    
    // Send response synchronously
    sendResponse({ success: true });
    return false; // Changed to false since we're handling synchronously
  }

  /**
   * Handle panel leave request
   */
  handleLeavePanel(request, sender, sendResponse) {
    const tabId = sender.tab?.id;
    if (tabId) {
      this.activePanelTabs.delete(tabId);
      this.streamHandler.removeTabFromAllStreams(tabId);
    }
    sendResponse({ success: true });
    return true;
  }
  
  /**
   * Handle start new conversation request
   */
  handleStartNewConversation(request, sender, sendResponse) {
    console.log('Starting new conversation for agent:', request.agentId);
    this.startNewConversation(request.agentId)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => {
        console.error('Error starting new conversation:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  /**
   * Start a new conversation for an agent
   */
  async startNewConversation(agentId) {
    const result = await this.agents.startNewConversation(agentId);
    if (!result) return false;
    
    const { agent, oldConversationId, newConversationId } = result;
    
    // Clear content in all panels for this agent
    this.streamHandler.broadcastToAgentTabs(agent.id, {
      action: 'STREAM_CONTENT',
      content: '',
      isFirst: true,
      agentId: agent.id
    });
    
    // Update conversation ID in all panels
    this.streamHandler.broadcastToAgentTabs(agent.id, {
      action: 'UPDATE_CONVERSATION_ID',
      conversationId: newConversationId,
      agentId: agent.id
    });
    
    // Clear old conversation history
    if (oldConversationId) {
      this.conversations.clearConversationHistory(oldConversationId)
        .catch(error => console.error('Error clearing old conversation:', error));
    }
    
    return { agent, conversationId: newConversationId };
  }
  
  /**
   * Handle agent switch request
   */
  handleSwitchAgent(request, sender, sendResponse) {
    console.log('Switching to agent:', request.agentId);
    this.agents.setActiveAgent(request.agentId)
      .then(agent => {
        if (!agent) {
          sendResponse({ success: false, error: 'Agent not found' });
          return;
        }
        
        // If the sender is a tab, add it to the agent's stream tabs
        if (sender.tab?.id) {
          this.streamHandler.addTabToAgentStream(agent.id, sender.tab.id);
        }
        
        sendResponse({ success: true, agent });
      })
      .catch(error => {
        console.error('Error switching agent:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  /**
   * Handle rejoin conversation request
   */
  handleRejoinConversation(request, sender, sendResponse) {
    console.log('Rejoining conversation:', request.conversationId);
    
    // Find agent that owns this conversation
    let targetAgent = null;
    
    for (const agent of this.agents.getAllAgents()) {
      if (agent.currentConversationId === request.conversationId) {
        targetAgent = agent;
        break;
      }
    }
    
    if (!targetAgent) {
      // If no agent currently owns this conversation, assign it to the active agent
      targetAgent = this.agents.getActiveAgent();
      this.agents.updateAgent(targetAgent.id, {
        currentConversationId: request.conversationId
      }).catch(error => console.error('Error updating agent conversation:', error));
    }
    
    // Broadcast the conversation ID update to all panels
    this.streamHandler.broadcastToAllTabs({
      action: 'UPDATE_CONVERSATION_ID',
      conversationId: request.conversationId,
      agentId: targetAgent.id
    });
    
    // Also update active agent
    this.agents.setActiveAgent(targetAgent.id)
      .catch(error => console.error('Error setting active agent:', error));
    
    sendResponse({ success: true, agentId: targetAgent.id });
    return true;
  }
  
  /**
   * Handle analyze page request
   */
  handleAnalyzePage(request, sender, sendResponse) {
    console.log('Handling page analysis');
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.error('No tab ID available for analysis');
      sendResponse({ success: false, error: 'No tab ID available' });
      return false;
    }

    // Ensure sending tab is in active panels
    this.activePanelTabs.add(tabId);
    
    // Create a Promise race between our operation and a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out - the request took too long to complete. Please try again.')), 90000) // 90 second timeout
    );

    Promise.race([
      this.api.sendChatMessage(
        null, // No explicit message for analysis
        request.data.url,
        request.data.text,
        request.data.title,
        tabId,
        this.agents.getActiveAgent().id,
        request.data.conversationId,
        this.streamHandler,
        this.conversations
      ),
      timeoutPromise
    ])
      .then(response => {
        console.log('Analysis complete:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in message handler:', error);
        // Check if this is a connection error
        if (error.message.includes('Extension context invalidated') || 
            error.message.includes('Could not establish connection')) {
          sendResponse({ 
            success: false, 
            error: 'The extension needs to be reloaded. Please refresh the page and try again.'
          });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      });
    
    return true;
  }
  
  /**
   * Handle chat message request
   */
  handleChatMessage(request, sender, sendResponse) {
    console.log('Handling chat message');
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.error('No tab ID available for chat');
      sendResponse({ success: false, error: 'No tab ID available' });
      return false;
    }

    // Ensure sending tab is in active panels
    this.activePanelTabs.add(tabId);

    // Create a Promise race between our operation and a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out - the request took too long to complete. Please try again.')), 900000) // 15 minute timeout
    );

    Promise.race([
      this.api.sendChatMessage(
        request.data.message,
        request.data.url,
        request.data.pageContent,
        request.data.title,
        tabId,
        request.data.agentId,
        request.data.conversationId,
        this.streamHandler,
        this.conversations
      ),
      timeoutPromise
    ])
      .then(response => {
        console.log('Chat handling complete:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in chat handler:', error);
        // Check if this is a connection error
        if (error.message.includes('Extension context invalidated') || 
            error.message.includes('Could not establish connection')) {
          sendResponse({ 
            success: false, 
            error: 'The extension needs to be reloaded. Please refresh the page and try again.'
          });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      });

    return true;
  }
  
  /**
   * Handle get agents request
   */
  handleGetAgents(request, sender, sendResponse) {
    this.agents.initialize().then(() => {
      sendResponse({
        success: true,
        agents: this.agents.getAllAgents(),
        activeAgentId: this.agents.activeAgentId
      });
    }).catch(error => {
      console.error('Error getting agents:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
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
  
  /**
   * Handle message deletion request
   */
  async handleDeleteMessage(request, sender, sendResponse) {
    try {
      const { messageId, conversationId } = request;
      
      // Delete the message
      await this.conversations.deleteMessage(messageId, conversationId);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true;
  }
  
  /**
   * Handle message save request
   */
  handleSaveMessage(request, sender, sendResponse) {
    const { message, conversationId } = request;
    
    // Save the message and properly chain the Promise
    this.conversations.saveMessage(message, conversationId)
      .then(result => {
        console.log('Save message result:', result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Error saving message:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep the sendResponse channel open
  }
}

export default MessageRouter;