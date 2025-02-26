/**
 * Panel Manager
 * 
 * Handles creation, updating, and removal of the AI assistant panel in the page
 */

import { formatContent } from './index';

class PanelManager {
  constructor() {
    this.panel = null;
    this.agents = [];
    this.activeAgentId = null;
  }
  
  /**
   * Check if panel exists
   */
  hasPanel() {
    return !!this.panel || !!document.querySelector('.ai-assistant-panel');
  }
  
  /**
   * Get the existing panel or create a new one
   */
  getOrCreatePanel(agents, activeAgentId, conversationId) {
    if (this.hasPanel()) {
      this.panel = document.querySelector('.ai-assistant-panel');
      return this.panel;
    }
    
    this.agents = agents || [];
    this.activeAgentId = activeAgentId;
    
    // Create the panel
    this.panel = document.createElement('div');
    this.panel.className = 'ai-assistant-panel';
    this.panel.dataset.conversationId = conversationId;
    this.panel.dataset.activeAgentId = activeAgentId;
    
    // Set panel styling
    this.panel.style.cssText = `
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
    
    // Create panel components
    this.createHeader();
    this.createContent();
    this.createLoadingIndicator();
    this.createChatInput();
    
    // Add panel to DOM
    document.body.appendChild(this.panel);
    console.log('Panel created and added to page');
    
    // Notify background script that the panel is ready
    chrome.runtime.sendMessage({ 
      action: 'JOIN_PANEL',
      agentId: activeAgentId
    });
    
    return this.panel;
  }
  
  /**
   * Create panel header
   */
  createHeader() {
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
    title.className = 'agent-title';
    const activeAgent = this.agents.find(a => a.id === this.activeAgentId) || { name: 'AI Assistant' };
    title.textContent = activeAgent.name;
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
      chrome.runtime.sendMessage({ 
        action: 'START_NEW_CONVERSATION',
        agentId: this.panel.dataset.activeAgentId
      });
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
      this.removePanel();
      chrome.runtime.sendMessage({ action: 'LEAVE_PANEL' });
    };

    buttonContainer.appendChild(newConvBtn);
    buttonContainer.appendChild(closeBtn);
    headerTop.appendChild(title);
    headerTop.appendChild(buttonContainer);

    const conversationIdDisplay = document.createElement('div');
    conversationIdDisplay.className = 'conversation-id-display';
    conversationIdDisplay.style.cssText = `
      font-size: 10px;
      opacity: 0.8;
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    conversationIdDisplay.title = this.panel.dataset.conversationId;
    conversationIdDisplay.textContent = this.panel.dataset.conversationId;

    header.appendChild(headerTop);
    header.appendChild(conversationIdDisplay);
    
    // Create agent tabs
    this.createAgentTabs(header);
    
    this.panel.appendChild(header);
  }
  
  /**
   * Create agent tabs
   */
  createAgentTabs(container) {
    if (!this.agents || this.agents.length <= 1) return;
    
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'agent-tabs';
    tabsContainer.style.cssText = `
      display: flex;
      overflow-x: auto;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      margin-top: 8px;
      -ms-overflow-style: none;
      scrollbar-width: none;
    `;
    
    // Hide scrollbar
    const style = document.createElement('style');
    style.textContent = `
      .agent-tabs::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(style);
    
    // Create a tab for each agent
    this.agents.forEach(agent => {
      const tab = document.createElement('div');
      tab.className = 'agent-tab';
      tab.dataset.agentId = agent.id;
      tab.textContent = agent.name;
      tab.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        white-space: nowrap;
        border-radius: 4px;
        transition: all 0.2s;
        font-size: 13px;
        ${agent.id === this.activeAgentId ? 
          'background: rgba(255, 255, 255, 0.2); font-weight: bold;' : 
          'opacity: 0.85;'}
      `;
      
      // Hover effects
      tab.onmouseover = () => {
        if (agent.id !== this.activeAgentId) {
          tab.style.opacity = '1';
          tab.style.background = 'rgba(255, 255, 255, 0.1)';
        }
      };
      tab.onmouseout = () => {
        if (agent.id !== this.activeAgentId) {
          tab.style.opacity = '0.85';
          tab.style.background = '';
        }
      };
      
      // On tab click, select the agent
      tab.onclick = () => {
        if (agent.id === this.activeAgentId) return;
        
        // Update tab styles
        document.querySelectorAll('.agent-tab').forEach(t => {
          t.style.background = '';
          t.style.fontWeight = 'normal';
          t.style.opacity = '0.85';
        });
        tab.style.background = 'rgba(255, 255, 255, 0.2)';
        tab.style.fontWeight = 'bold';
        tab.style.opacity = '1';
        
        // Update active agent
        this.activeAgentId = agent.id;
        this.panel.dataset.activeAgentId = agent.id;
        
        // Update panel title
        const title = this.panel.querySelector('.agent-title');
        if (title) {
          title.textContent = agent.name;
        }
        
        // Notify background script of agent switch
        chrome.runtime.sendMessage({ 
          action: 'SWITCH_AGENT', 
          agentId: agent.id 
        }).then(response => {
          if (response.success) {
            // Update conversation ID
            this.panel.dataset.conversationId = response.agent.currentConversationId;
            
            // Update conversation ID display
            const conversationIdDisplay = this.panel.querySelector('.conversation-id-display');
            if (conversationIdDisplay) {
              conversationIdDisplay.title = response.agent.currentConversationId;
              conversationIdDisplay.textContent = response.agent.currentConversationId;
            }
            
            // Clear content
            const content = this.panel.querySelector('.panel-content');
            if (content) {
              content.innerHTML = '<p>Type a message below to chat about this page.</p>';
            }
          }
        });
      };
      
      tabsContainer.appendChild(tab);
    });
    
    // Add "Manage Agents" button
    const manageBtn = document.createElement('div');
    manageBtn.className = 'agent-tab manage-agents';
    manageBtn.innerHTML = '⚙️';
    manageBtn.title = 'Manage Agents';
    manageBtn.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      white-space: nowrap;
      border-radius: 4px;
      transition: all 0.2s;
      font-size: 13px;
      opacity: 0.85;
    `;
    
    // Hover effects for manage button
    manageBtn.onmouseover = () => {
      manageBtn.style.opacity = '1';
      manageBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    manageBtn.onmouseout = () => {
      manageBtn.style.opacity = '0.85';
      manageBtn.style.background = '';
    };
    
    // Open options page when clicked
    manageBtn.onclick = () => {
      chrome.runtime.openOptionsPage();
    };
    
    tabsContainer.appendChild(manageBtn);
    container.appendChild(tabsContainer);
  }
  
  /**
   * Create content area
   */
  createContent() {
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
    content.innerHTML = '<p>Type a message below to chat about this page.</p>';
    
    this.panel.appendChild(content);
  }
  
  /**
   * Create loading indicator
   */
  createLoadingIndicator() {
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
    
    this.panel.appendChild(loadingIndicator);
  }
  
  /**
   * Create chat input area
   */
  createChatInput() {
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
            conversationId: this.panel.dataset.conversationId,
            agentId: this.panel.dataset.activeAgentId
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
    
    this.panel.appendChild(chatArea);
  }
  
  /**
   * Remove panel from page
   */
  removePanel() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    } else {
      const panel = document.querySelector('.ai-assistant-panel');
      if (panel) {
        panel.remove();
      }
    }
  }
  
  /**
   * Toggle panel visibility
   */
  togglePanel(agents, activeAgentId, conversationId) {
    if (this.hasPanel()) {
      this.removePanel();
      return { created: false, visible: false };
    } else {
      this.getOrCreatePanel(agents, activeAgentId, conversationId);
      return { created: true, visible: true };
    }
  }
  
  /**
   * Update agent tabs
   */
  updateAgentTabs(agents, activeAgentId) {
    this.agents = agents;
    
    if (!this.panel) {
      console.warn('No panel to update agent tabs');
      return;
    }
    
    // Find header and remove old tabs
    const header = this.panel.querySelector('.agent-tabs');
    if (header) {
      header.remove();
    }
    
    // Create new tabs
    const headerContainer = this.panel.querySelector('div:first-child');
    if (headerContainer) {
      this.createAgentTabs(headerContainer);
    }
    
    // Update active agent ID
    this.activeAgentId = activeAgentId;
    this.panel.dataset.activeAgentId = activeAgentId;
    
    // Update title
    const activeAgent = this.agents.find(a => a.id === activeAgentId);
    if (activeAgent) {
      const title = this.panel.querySelector('.agent-title');
      if (title) {
        title.textContent = activeAgent.name;
      }
    }
  }
  
  /**
   * Show loading indicator
   */
  showLoading() {
    if (!this.panel) return;
    
    const loadingIndicator = this.panel.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }
  }
  
  /**
   * Hide loading indicator
   */
  hideLoading() {
    if (!this.panel) return;
    
    const loadingIndicator = this.panel.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }
  
  /**
   * Update content with streaming or complete response
   */
  updateContent(content, isFirst = false) {
    if (!this.panel) return;
    
    const contentElement = this.panel.querySelector('.panel-content');
    if (!contentElement) return;
    
    // Track if we should auto-scroll based on user's scroll position
    const shouldAutoScroll = contentElement.scrollHeight - contentElement.scrollTop === contentElement.clientHeight;
    
    if (isFirst) {
      contentElement.innerHTML = '';
      
      // If content is empty and it's the first chunk, show default message
      if (!content) {
        contentElement.innerHTML = '<p>Type a message below to chat about this page.</p>';
        return;
      }
      
      // Add a pre element for formatting
      const pre = document.createElement('pre');
      pre.style.cssText = `
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: inherit;
        line-height: inherit;
      `;
      contentElement.appendChild(pre);
    }
    
    const pre = contentElement.querySelector('pre');
    if (pre) {
      const formattedContent = formatContent(content);
      pre.innerHTML += formattedContent;
      
      // Only auto-scroll if we were at the bottom before
      if (shouldAutoScroll) {
        // Use requestAnimationFrame to ensure the DOM has updated
        requestAnimationFrame(() => {
          contentElement.scrollTo({
            top: contentElement.scrollHeight,
            behavior: 'smooth'
          });
        });
      }
    }
  }
  
  /**
   * Show error message
   */
  showError(errorMessage) {
    if (!this.panel) return;
    
    const contentElement = this.panel.querySelector('.panel-content');
    if (contentElement) {
      contentElement.innerHTML = `<p style="color: red;">Error: ${formatContent(errorMessage)}</p>`;
      this.hideLoading();
    }
  }
  
  /**
   * Update conversation ID
   */
  updateConversationId(conversationId, agentId) {
    if (!this.panel) return;
    
    // Update data attribute
    this.panel.dataset.conversationId = conversationId;
    
    // Update display
    const conversationIdDisplay = this.panel.querySelector('.conversation-id-display');
    if (conversationIdDisplay) {
      conversationIdDisplay.title = conversationId;
      conversationIdDisplay.textContent = conversationId;
    }
    
    // If an agent ID is provided, update active agent
    if (agentId) {
      this.activeAgentId = agentId;
      this.panel.dataset.activeAgentId = agentId;
      
      // Update title
      const activeAgent = this.agents.find(a => a.id === agentId);
      if (activeAgent) {
        const title = this.panel.querySelector('.agent-title');
        if (title) {
          title.textContent = activeAgent.name;
        }
      }
      
      // Update tab selection
      const tabs = this.panel.querySelectorAll('.agent-tab');
      tabs.forEach(tab => {
        if (tab.dataset.agentId === agentId) {
          tab.style.background = 'rgba(255, 255, 255, 0.2)';
          tab.style.fontWeight = 'bold';
          tab.style.opacity = '1';
        } else {
          tab.style.background = '';
          tab.style.fontWeight = 'normal';
          tab.style.opacity = '0.85';
        }
      });
    }
  }
}

export default PanelManager;