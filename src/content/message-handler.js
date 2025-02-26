/**
 * Message Handler
 * 
 * Handles messages between content script and background script
 */

import { gatherPageInfo } from './index';

class MessageHandler {
  constructor(panelManager) {
    this.panel = panelManager;
  }
  
  /**
   * Handle messages from background script
   */
  handleMessage(request, sender, sendResponse) {
    console.log('Content script received message:', request?.action);
    
    switch (request.action) {
      case 'CAPTURE_PAGE':
        return this.handleCapturePage(sendResponse);

      case 'OPEN_CHAT_PANEL':
        return this.handleOpenChatPanel(request, sendResponse);
        
      case 'UPDATE_AGENT_TABS':
        return this.handleUpdateAgentTabs(request, sendResponse);
        
      case 'UPDATE_CONVERSATION_ID':
        return this.handleUpdateConversationId(request, sendResponse);
        
      case 'SHOW_LOADING':
        return this.handleShowLoading(request, sendResponse);
        
      case 'HIDE_LOADING':
        return this.handleHideLoading(request, sendResponse);
        
      case 'STREAM_CONTENT':
        return this.handleStreamContent(request, sendResponse);
        
      case 'SHOW_ERROR':
        return this.handleShowError(request, sendResponse);
        
      default:
        console.warn('Unknown message action:', request.action);
        return false;
    }
  }

  /**
   * Handle open chat panel request
   */
  handleOpenChatPanel(request, sendResponse) {
    console.log('Handling open chat panel request', request);
    const { agents, activeAgentId } = request;
    
    // Get the active agent's conversation ID
    const activeAgent = agents.find(a => a.id === activeAgentId);
    const conversationId = activeAgent ? activeAgent.currentConversationId : null;
    
    // Toggle panel visibility
    const result = this.panel.togglePanel(agents, activeAgentId, conversationId);
    sendResponse({ success: true, ...result });
    return true;
  }
  
  /**
   * Handle capture page request
   */
  handleCapturePage(sendResponse) {
    console.log('Capturing page content');
    const pageData = gatherPageInfo();
    console.log('Sending response back to popup');
    sendResponse({ success: true, data: pageData });
    return true;
  }
  
  /**
   * Handle update agent tabs request
   */
  handleUpdateAgentTabs(request, sendResponse) {
    const { agents, activeAgentId } = request;
    this.panel.updateAgentTabs(agents, activeAgentId);
    return true;
  }
  
  /**
   * Handle update conversation ID request
   */
  handleUpdateConversationId(request, sendResponse) {
    const { conversationId, agentId } = request;
    this.panel.updateConversationId(conversationId, agentId);
    return true;
  }
  
  /**
   * Handle show loading request
   */
  handleShowLoading(request, sendResponse) {
    this.panel.showLoading();
    return true;
  }
  
  /**
   * Handle hide loading request
   */
  handleHideLoading(request, sendResponse) {
    this.panel.hideLoading();
    return true;
  }
  
  /**
   * Handle stream content request
   */
  handleStreamContent(request, sendResponse) {
    const { content, isFirst, agentId } = request;
    
    // Only update if this is for the active agent
    if (agentId && this.panel.activeAgentId !== agentId) {
      // Skip update for different agent
      return true;
    }
    
    this.panel.updateContent(content, isFirst);
    return true;
  }
  
  /**
   * Handle show error request
   */
  handleShowError(request, sendResponse) {
    const { error, agentId } = request;
    
    // Only show error if this is for the active agent
    if (agentId && this.panel.activeAgentId !== agentId) {
      // Skip error for different agent
      return true;
    }
    
    this.panel.showError(error);
    return true;
  }
  
  /**
   * Handle chat message event from panel
   */
  handleChatEvent(event) {
    console.log('Content script received chat event:', event.detail);
    
    // Gather current page info for context
    const pageInfo = gatherPageInfo();
    
    // Get conversation ID and agent ID from the panel
    const panel = document.querySelector('.ai-assistant-panel');
    const conversationId = panel?.dataset?.conversationId;
    const agentId = panel?.dataset?.activeAgentId;
    
    if (!conversationId || !agentId) {
      console.error('No conversation ID or agent ID found');
      this.panel.showError('No conversation ID or agent ID found. Please refresh the page and try again.');
      return;
    }
    
    chrome.runtime.sendMessage({
      action: 'CHAT_MESSAGE',
      data: {
        message: event.detail.message,
        url: pageInfo.url,
        pageContent: pageInfo.text,
        title: pageInfo.title,
        conversationId: conversationId,
        agentId: agentId
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending chat message:', chrome.runtime.lastError);
        this.panel.showError('Error sending chat message: ' + chrome.runtime.lastError.message);
      }
    });
  }
}

export default MessageHandler;