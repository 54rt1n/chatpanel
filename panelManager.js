// panelManager.js
class PanelManager {
  constructor() {
    // Single conversation state
    this.currentConversationId = null;
    this.currentContent = '';
    this.isStreaming = false;
    
    // Panel visibility state per tab
    this.visibilityState = new Map();
    
    // Stream state
    this.activeStream = null;
    this.activeStreamTabs = new Set();
    
    // Initialize chrome.storage listener
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    
    // Initialize tab lifecycle listeners
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
  }

  async initialize() {
    // Load persisted state
    const state = await chrome.storage.local.get([
      'currentConversationId',
      'currentContent',
      'panelVisibility'
    ]);
    
    this.currentConversationId = state.currentConversationId || this.generateConversationId();
    this.currentContent = state.currentContent || '';
    
    // Restore panel visibility state
    if (state.panelVisibility) {
      this.visibilityState = new Map(Object.entries(state.panelVisibility));
    }
  }

  generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async setPanelVisibility(tabId, isVisible) {
    this.visibilityState.set(tabId, { isVisible });
    
    // Persist visibility state
    await chrome.storage.local.set({
      panelVisibility: Object.fromEntries(this.visibilityState)
    });

    // Broadcast state change
    this.broadcastToPanel(tabId, {
      action: 'UPDATE_PANEL_STATE',
      isVisible,
      content: this.currentContent,
      conversationId: this.currentConversationId
    });
  }

  async startNewConversation() {
    const newId = this.generateConversationId();
    this.currentConversationId = newId;
    this.currentContent = '';
    
    // Persist state
    await chrome.storage.local.set({
      currentConversationId: newId,
      currentContent: ''
    });

    // Broadcast to all visible panels
    this.broadcastToAllPanels({
      action: 'UPDATE_CONVERSATION',
      conversationId: newId,
      content: ''
    });
  }

  async updateContent(content, isFirst = false) {
    if (isFirst) {
      this.currentContent = content;
    } else {
      this.currentContent += content;
    }

    // Persist content
    await chrome.storage.local.set({
      currentContent: this.currentContent
    });

    // Broadcast to visible panels
    this.broadcastToAllPanels({
      action: 'STREAM_CONTENT',
      content,
      isFirst
    });
  }

  async handleStorageChange(changes, namespace) {
    if (namespace === 'local') {
      if (changes.currentConversationId) {
        this.currentConversationId = changes.currentConversationId.newValue;
      }
      if (changes.currentContent) {
        this.currentContent = changes.currentContent.newValue;
      }
    }
  }

  handleTabRemoved(tabId) {
    this.visibilityState.delete(tabId);
  }

  handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      // Get current panel state
      const panelState = this.visibilityState.get(tabId);
      // Only restore if panel was visible and url has changed
      if (panelState?.isVisible && changeInfo.url) {
        this.restorePanel(tabId);
      }
    }
  }

  async restorePanel(tabId) {
    const executeCode = (state) => {
      const panel = document.querySelector('.ai-assistant-panel');
      if (!panel) {
        // Create new panel with state
        const panel = document.createElement('div');
        panel.className = 'ai-assistant-panel';
        panel.style.display = 'flex';
        panel.dataset.conversationId = state.conversationId;
        
        // Set panel styles
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

        // Add header
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
        newConvBtn.onclick = () => {
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
        closeBtn.onclick = () => {
          panel.style.display = 'none';
          chrome.runtime.sendMessage({ 
            action: 'UPDATE_PANEL_VISIBILITY',
            isVisible: false
          });
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
        conversationIdDisplay.title = state.conversationId;
        conversationIdDisplay.textContent = state.conversationId;

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

        // Restore content if available
        if (state.content) {
          const pre = document.createElement('pre');
          pre.style.cssText = `
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            line-height: inherit;
          `;
          pre.innerHTML = state.content;
          content.appendChild(pre);
        } else {
          content.innerHTML = '<p>Type a message below to chat about this page.</p>';
        }

        // Restore scroll position
        if (state.scrollPosition) {
          content.scrollTop = state.scrollPosition;
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

        const handleSubmit = () => {
          const message = chatInput.value.trim();
          if (message) {
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

        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        });

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

        // Notify background script that panel has joined
        chrome.runtime.sendMessage({ action: 'JOIN_PANEL' });
      }
    };

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        function: executeCode,
        args: [{
          content: this.currentContent,
          conversationId: this.currentConversationId,
          isVisible: true,
          scrollPosition: this.visibilityState.get(tabId)?.scrollPosition || 0
        }]
      });
    } catch (error) {
      console.error('Failed to restore panel:', error);
      this.visibilityState.delete(tabId);
    }
  }

  async broadcastToPanel(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error('Failed to broadcast to panel:', error);
      // Handle disconnected panels
      if (error.message.includes('Could not establish connection')) {
        this.visibilityState.delete(tabId);
      }
    }
  }

  async broadcastToAllPanels(message) {
    const visibleTabs = Array.from(this.visibilityState.entries())
      .filter(([_, isVisible]) => isVisible)
      .map(([tabId]) => tabId);

    await Promise.all(
      visibleTabs.map(tabId => this.broadcastToPanel(tabId, message))
    );
  }

  // Add stream management methods
  async startStream(reader, tabId) {
    // Cancel any existing stream
    await this.cancelStream();
    
    this.activeStream = reader;
    this.activeStreamTabs.add(tabId);
    this.isStreaming = true;
  }

  async cancelStream() {
    if (this.activeStream) {
      try {
        await this.activeStream.cancel();
      } catch (e) {
        console.warn('Error canceling stream:', e);
      }
      this.activeStream = null;
    }
    this.activeStreamTabs.clear();
    this.isStreaming = false;
  }

  addStreamTab(tabId) {
    this.activeStreamTabs.add(tabId);
  }

  removeStreamTab(tabId) {
    this.activeStreamTabs.delete(tabId);
  }
}

export const panelManager = new PanelManager();