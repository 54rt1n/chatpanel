/**
 * History Page Script
 * 
 * Handles conversation history display and interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM elements
  const agentFilter = document.getElementById('agentFilter');
  const sortFilter = document.getElementById('sortFilter');
  const searchInput = document.getElementById('searchInput');
  const conversationCount = document.getElementById('conversationCount');
  const conversationItems = document.getElementById('conversationItems');
  const conversationDetail = document.getElementById('conversationDetail');
  const backButton = document.getElementById('backButton');
  const modal = document.getElementById('confirmationModal');
  
  // State
  let conversations = [];
  let agents = [];
  let selectedConversationId = null;
  let messageToSave = null;
  let conversationIdToSave = null;
  
  // Modal handling functions
  function showModal(message, conversationId) {
    messageToSave = message;
    conversationIdToSave = conversationId;
    modal.classList.add('show');
  }

  function hideModal() {
    modal.classList.remove('show');
    messageToSave = null;
    conversationIdToSave = null;
  }
  
  // Initialize
  await initialize();
  
  /**
   * Initialize the page
   */
  async function initialize() {
    try {
      // Load agents
      const agentsResponse = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
      if (agentsResponse.success) {
        agents = agentsResponse.agents;
        populateAgentFilter();
      }
      
      // Load conversations
      await loadConversations();
      
      // Set up event listeners
      setupEventListeners();
    } catch (error) {
      console.error('Error initializing history page:', error);
      showError('Failed to initialize history page. Please try again later.');
    }
  }
  
  /**
   * Populate agent filter dropdown
   */
  function populateAgentFilter() {
    // Clear existing options except "All Agents"
    while (agentFilter.options.length > 1) {
      agentFilter.remove(1);
    }
    
    // Add agent options
    agents.forEach(agent => {
      const option = document.createElement('option');
      option.value = agent.id;
      option.textContent = agent.name;
      agentFilter.appendChild(option);
    });
  }
  
  /**
   * Load conversations from storage
   */
  async function loadConversations() {
    try {
      // Get current filter values
      const agentId = agentFilter.value;
      const sortBy = sortFilter.value;
      const searchText = searchInput.value.toLowerCase();
      
      // Request conversations from background script
      const response = await chrome.runtime.sendMessage({ 
        action: 'GET_CONVERSATIONS',
        agentId: agentId === 'all' ? null : agentId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to load conversations');
      }
      
      conversations = response.conversations || [];
      
      // Apply search filter
      if (searchText) {
        conversations = conversations.filter(conversation => 
          conversation.title.toLowerCase().includes(searchText) ||
          conversation.preview.toLowerCase().includes(searchText)
        );
      }
      
      // Apply sorting
      sortConversations(sortBy);
      
      // Update count
      conversationCount.textContent = `${conversations.length} Conversation${conversations.length !== 1 ? 's' : ''}`;
      
      // Render conversations
      renderConversationList();
    } catch (error) {
      console.error('Error loading conversations:', error);
      showError('Failed to load conversations: ' + error.message);
    }
  }
  
  /**
   * Sort conversations based on the selected sort option
   */
  function sortConversations(sortBy) {
    switch (sortBy) {
      case 'newest':
        conversations.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'oldest':
        conversations.sort((a, b) => a.timestamp - b.timestamp);
        break;
      case 'messagesDesc':
        conversations.sort((a, b) => b.messageCount - a.messageCount);
        break;
      case 'messagesAsc':
        conversations.sort((a, b) => a.messageCount - b.messageCount);
        break;
    }
  }
  
  /**
   * Render the conversation list
   */
  function renderConversationList() {
    // Clear existing items
    conversationItems.innerHTML = '';
    
    if (conversations.length === 0) {
      // Show empty state
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <div class="empty-icon">📝</div>
        <div class="empty-message">No conversations found</div>
        <div class="empty-detail">Try changing the filters or start a new conversation</div>
      `;
      conversationItems.appendChild(emptyState);
      return;
    }
    
    // Render each conversation item
    conversations.forEach(conversation => {
      const item = createConversationItem(conversation);
      conversationItems.appendChild(item);
    });
    
    // If a conversation was previously selected, select it again
    if (selectedConversationId) {
      const selectedItem = conversationItems.querySelector(`[data-conversation-id="${selectedConversationId}"]`);
      if (selectedItem) {
        selectedItem.classList.add('active');
      } else {
        // If the selected conversation is no longer in the list, clear the selection
        selectedConversationId = null;
        showEmptyDetail();
      }
    }
  }
  
  /**
   * Create a conversation list item
   */
  function createConversationItem(conversation) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.conversationId = conversation.id;
    
    // Add active class if this is the selected conversation
    if (conversation.id === selectedConversationId) {
      item.classList.add('active');
    }
    
    // Format date
    const date = new Date(conversation.timestamp * 1000);
    const formattedDate = date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
    
    // Find agent name
    const agent = agents.find(a => a.id === conversation.agentId);
    const agentName = agent ? agent.name : 'Unknown Agent';
    
    item.innerHTML = `
      <div class="conversation-title">${escapeHtml(conversation.title)}</div>
      <div class="conversation-preview">${escapeHtml(conversation.preview)}</div>
      <div class="conversation-meta">
        <span class="conversation-date">${formattedDate}</span>
        <span class="conversation-agent">${escapeHtml(agentName)}</span>
      </div>
    `;
    
    // Click handler
    item.addEventListener('click', () => {
      // Update UI
      document.querySelectorAll('.conversation-item.active').forEach(el => {
        el.classList.remove('active');
      });
      item.classList.add('active');
      
      // Set selected conversation
      selectedConversationId = conversation.id;
      
      // Load conversation detail
      loadConversationDetail(conversation.id);
    });
    
    return item;
  }
  
  /**
   * Load conversation detail
   */
  async function loadConversationDetail(conversationId) {
    try {
      // Show loading state
      conversationDetail.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-message">Loading conversation...</div>
        </div>
      `;
      
      // Request conversation messages from background script
      const response = await chrome.runtime.sendMessage({ 
        action: 'GET_CONVERSATION_MESSAGES',
        conversationId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to load conversation detail');
      }
      
      const messages = response.messages || [];
      const conversation = conversations.find(c => c.id === conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Find agent name
      const agent = agents.find(a => a.id === conversation.agentId);
      const agentName = agent ? agent.name : 'Unknown Agent';
      
      // Render conversation detail
      renderConversationDetail(conversation, agentName, messages);
    } catch (error) {
      console.error('Error loading conversation detail:', error);
      conversationDetail.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-message">Error loading conversation</div>
          <div class="empty-detail">${escapeHtml(error.message)}</div>
        </div>
      `;
    }
  }
  
  /**
   * Render conversation detail
   */
  function renderConversationDetail(conversation, agentName, messages) {
    const detail = document.getElementById('conversationDetail');
    detail.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'conversation-detail-header';
    
    const title = document.createElement('div');
    title.innerHTML = `
      <h2 class="detail-title">${escapeHtml(conversation.title)}</h2>
      <div class="detail-meta">
        <span class="detail-agent">${escapeHtml(agentName || 'Unknown Agent')}</span>
        <span class="detail-date">${new Date(conversation.timestamp * 1000).toLocaleString()}</span>
        <span class="detail-id">${conversation.id}</span>
      </div>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    actions.innerHTML = `
      <button class="action-btn rejoin">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12h18M3 12l6-6M3 12l6 6"/>
        </svg>
        Rejoin Conversation
      </button>
      <button class="action-btn export">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export
      </button>
    `;
    
    header.appendChild(title);
    header.appendChild(actions);
    detail.appendChild(header);
    
    // Create messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'conversation-messages';
    
    messages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${message.role} ${message.saved ? 'saved' : ''}`;
      messageElement.setAttribute('data-timestamp', message.timestamp);
      
      messageElement.innerHTML = `
        <div class="message-header">
          <div class="message-info">
            <span class="message-role">${message.role === 'user' ? 'You' : 'Assistant'}</span>
            <span class="message-time">${new Date(message.timestamp * 1000).toLocaleString()}</span>
          </div>
          <div class="message-actions">
            <button class="message-btn delete" title="Delete message">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
            <button class="message-btn save" title="Save message">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            </button>
            <button class="message-btn saving" title="Saving message...">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </button>
            <button class="message-btn saved" title="Message saved">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="message-content">${formatMessageContent(message.content)}</div>
        <div class="message-meta">
          ${message.url ? `<a href="${escapeHtml(message.url)}" class="message-url" target="_blank">${escapeHtml(message.title || message.url)}</a>` : ''}
          ${message.model ? `<span class="message-model">${escapeHtml(message.model)}</span>` : ''}
        </div>
      `;
      
      messagesContainer.appendChild(messageElement);
    });
    
    detail.appendChild(messagesContainer);
    
    // Set up event listeners for the new detail view
    setupMessageEventListeners(detail);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  /**
   * Show empty detail view
   */
  function showEmptyDetail() {
    conversationDetail.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-message">Select a conversation</div>
        <div class="empty-detail">Choose a conversation from the list to view its messages</div>
      </div>
    `;
  }
  
  /**
   * Show error message
   */
  function showError(message) {
    conversationDetail.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <div class="empty-message">Error</div>
        <div class="empty-detail">${escapeHtml(message)}</div>
      </div>
    `;
  }
  
  /**
   * Rejoin a conversation
   */
  async function rejoinConversation(conversationId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'REJOIN_CONVERSATION',
        conversationId
      });
      
      if (response.success) {
        // Instead of creating a new tab, try to find an existing tab with the page that had this conversation
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation && conversation.url) {
          // If we have the URL, navigate to it and send a message to open the chat panel
          const tabs = await chrome.tabs.query({url: conversation.url});
          
          if (tabs.length > 0) {
            // If a tab with this URL exists, activate it and send a message to show the panel
            await chrome.tabs.update(tabs[0].id, {active: true});
            await chrome.tabs.sendMessage(tabs[0].id, {
              action: 'OPEN_CHAT_PANEL',
              conversationId
            }).catch(error => {
              // If we can't send a message, the content script might not be loaded
              // Just navigate to the URL
              chrome.tabs.update(tabs[0].id, {url: conversation.url});
            });
            window.close(); // Close the history page
            return;
          }
          
          // If no tab with this URL exists, create a new one
          chrome.tabs.create({url: conversation.url}, async (tab) => {
            // Wait for the tab to load, then send the message to open the panel
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                // Wait a moment for content scripts to initialize
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, {
                    action: 'OPEN_CHAT_PANEL',
                    conversationId
                  }).catch(err => console.error('Error opening chat panel:', err));
                }, 500);
              }
            });
          });
        } else {
          // Fallback - just open the popup with the rejoin parameter
          chrome.runtime.openOptionsPage();
          setTimeout(() => {
            chrome.tabs.create({url: `popup.html?action=rejoin&conversationId=${conversationId}`});
          }, 100);
        }
      } else {
        throw new Error(response.error || 'Failed to rejoin conversation');
      }
    } catch (error) {
      console.error('Error rejoining conversation:', error);
      alert('Error rejoining conversation: ' + error.message);
    }
  }
  
  /**
   * Export a conversation
   */
  async function exportConversation(conversationId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXPORT_CONVERSATION',
        conversationId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to export conversation');
      }
      
      // Add agent name to the export
      const data = response.data;
      // Find the agent name based on the agent ID
      const agent = agents.find(a => a.id === data.agentId);
      if (agent) {
        data.agentName = agent.name;
      }
      
      // Create download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation_${conversationId}.json`;
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting conversation:', error);
      alert('Error exporting conversation: ' + error.message);
    }
  }
  
  /**
   * Save a message via API
   */
  async function saveMessage(message, conversationId) {
    try {
      console.log('Saving message:', {
        timestamp: message.timestamp,
        conversationId,
        messageData: message
      });

      // Show saving state for all messages with the same timestamp
      const messageElements = document.querySelectorAll('.message');
      messageElements.forEach(element => {
        const timestamp = element.getAttribute('data-timestamp');
        if (timestamp === message.timestamp.toString()) {
          element.classList.add('saving');
          element.classList.remove('saved');
        }
      });

      const response = await chrome.runtime.sendMessage({
        action: 'SAVE_MESSAGE',
        message: {
          timestamp: message.timestamp,
          role: message.role,
          content: message.content,
          url: message.url,
          title: message.title,
          model: message.model
        },
        conversationId
      });

      if (!response || !response.success) {
        console.log('Failed to save message:', response);
        // Remove saving state if failed
        messageElements.forEach(element => {
          const timestamp = element.getAttribute('data-timestamp');
          if (timestamp === message.timestamp.toString()) {
            element.classList.remove('saving');
          }
        });
        throw new Error(response?.error || 'Failed to save message');
      }

      // Update UI to show saved state for both user and assistant messages with same timestamp
      messageElements.forEach(element => {
        const timestamp = element.getAttribute('data-timestamp');
        if (timestamp === message.timestamp.toString()) {
          element.classList.remove('saving');
          element.classList.add('saved');
        }
      });

      // Show success message
      const status = document.createElement('div');
      status.className = 'status success';
      status.textContent = 'Message saved successfully';
      document.querySelector('.conversation-detail').appendChild(status);
      
      // Remove status message after 3 seconds
      setTimeout(() => {
        status.remove();
      }, 3000);

    } catch (error) {
      console.error('Error saving message:', error);
      
      // Show error message
      const status = document.createElement('div');
      status.className = 'status error';
      status.textContent = `Error saving message: ${error.message}`;
      document.querySelector('.conversation-detail').appendChild(status);
      
      // Remove error message after 5 seconds
      setTimeout(() => {
        status.remove();
      }, 5000);
    }
  }
  
  /**
   * Delete a message
   */
  async function deleteMessage(message, conversationId) {
    if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DELETE_MESSAGE',
        messageId: message.timestamp, // Use timestamp as message ID
        conversationId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete message');
      }
      
      // Show success message
      const status = document.createElement('div');
      status.className = 'status success';
      status.textContent = 'Message deleted successfully';
      document.body.appendChild(status);

      // Remove status after 3 seconds
      setTimeout(() => {
        status.remove();
      }, 3000);
      
      // Reload both conversation list and detail
      await loadConversations(); // Refresh the conversation list
      await loadConversationDetail(conversationId); // Refresh the conversation detail
    } catch (error) {
      console.error('Error deleting message:', error);
      
      // Show error message
      const status = document.createElement('div');
      status.className = 'status error';
      status.textContent = `Error deleting message: ${error.message}`;
      document.body.appendChild(status);

      // Remove status after 3 seconds
      setTimeout(() => {
        status.remove();
      }, 3000);
    }
  }
  
  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Filter changes
    agentFilter.addEventListener('change', loadConversations);
    sortFilter.addEventListener('change', loadConversations);
    
    // Search input (with debounce)
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(loadConversations, 300);
    });
    
    // Back button
    backButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Modal event listeners
    modal.querySelector('.modal-btn.cancel').addEventListener('click', hideModal);
    modal.querySelector('.modal-btn.confirm').addEventListener('click', async () => {
      if (messageToSave && conversationIdToSave) {
        await saveMessage(messageToSave, conversationIdToSave);
      }
      hideModal();
    });
  }
  
  /**
   * Set up message action event listeners
   */
  function setupMessageEventListeners(conversationDetail) {
    // Store handler functions so we can remove them properly
    const handlers = {
      messageAction: function(e) {
        const saveBtn = e.target.closest('.message-btn.save');
        const savedBtn = e.target.closest('.message-btn.saved');
        
        if (saveBtn || savedBtn) {
          const messageEl = (saveBtn || savedBtn).closest('.message');
          if (messageEl) {
            const timestamp = parseInt(messageEl.getAttribute('data-timestamp'), 10);
            const conversationId = selectedConversationId;
            
            // Get message data
            const message = {
              timestamp,
              role: messageEl.classList.contains('user') ? 'user' : 'assistant',
              content: messageEl.querySelector('.message-content').textContent,
              url: messageEl.querySelector('.message-url')?.href,
              title: messageEl.querySelector('.message-url')?.textContent,
              model: messageEl.querySelector('.message-model')?.textContent
            };

            if (savedBtn) {
              // Show confirmation modal for re-saving
              showModal(message, conversationId);
            } else {
              // Normal save for unsaved message
              saveMessage(message, conversationId);
            }
          }
        }
      },
      
      deleteAction: function(e) {
        const deleteBtn = e.target.closest('.message-btn.delete');
        if (deleteBtn) {
          const messageEl = deleteBtn.closest('.message');
          if (messageEl) {
            const timestamp = parseInt(messageEl.getAttribute('data-timestamp'), 10);
            const message = {
              timestamp,
              role: messageEl.classList.contains('user') ? 'user' : 'assistant'
            };
            deleteMessage(message, selectedConversationId);
          }
        }
      },
      
      rejoinAction: function(e) {
        const rejoinBtn = e.target.closest('.action-btn.rejoin');
        if (rejoinBtn && selectedConversationId) {
          rejoinConversation(selectedConversationId);
        }
      },
      
      exportAction: function(e) {
        const exportBtn = e.target.closest('.action-btn.export');
        if (exportBtn && selectedConversationId) {
          exportConversation(selectedConversationId);
        }
      }
    };
    
    // First, remove any existing event listeners from the old detail view
    if (conversationDetail._eventHandlers) {
      for (const [eventType, handler] of Object.entries(conversationDetail._eventHandlers)) {
        conversationDetail.removeEventListener(eventType, handler);
      }
    }
    
    // Store handlers on the element to be able to remove them later
    conversationDetail._eventHandlers = {
      click: function(e) {
        handlers.messageAction(e);
        handlers.deleteAction(e);
        handlers.rejoinAction(e);
        handlers.exportAction(e);
      }
    };
    
    // Add consolidated click handler
    conversationDetail.addEventListener('click', conversationDetail._eventHandlers.click);

    return conversationDetail;
  }
  
  /**
   * Format message content with proper line breaks
   */
  function formatMessageContent(content) {
    // Replace newlines with <br> tags
    return escapeHtml(content)
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  }
  
  /**
   * Escape HTML special characters
   */
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});