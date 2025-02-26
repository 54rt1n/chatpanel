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
  
  // State
  let conversations = [];
  let agents = [];
  let selectedConversationId = null;
  
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
    const date = new Date(conversation.timestamp);
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
    // Format date
    const date = new Date(conversation.timestamp);
    const formattedDate = date.toLocaleString();
    
    // Create header
    const header = document.createElement('div');
    header.className = 'conversation-detail-header';
    header.innerHTML = `
      <div>
        <h2 class="detail-title">${escapeHtml(conversation.title)}</h2>
        <div class="detail-meta">
          <span class="detail-date">${formattedDate}</span>
          <span class="detail-agent">${escapeHtml(agentName)}</span>
          <span class="detail-id">ID: ${escapeHtml(conversation.id)}</span>
        </div>
      </div>
      <div class="detail-actions">
        <button class="action-btn rejoin" id="rejoinBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8v4l3 3"/>
            <path d="M3.05 11a9 9 0 1 1 .5 4"/>
            <path d="M3 16V8h8"/>
          </svg>
          Rejoin Conversation
        </button>
        <button class="action-btn export" id="exportBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
        <button class="action-btn delete" id="deleteBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
          Delete
        </button>
      </div>
    `;
    
    // Create messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'conversation-messages';
    
    // Render messages
    if (messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-message">No messages found</div>
        </div>
      `;
    } else {
      // Group messages into pairs (user + assistant)
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        
        // Format date
        const messageDate = new Date(message.timestamp);
        const messageTime = messageDate.toLocaleTimeString(undefined, { 
          hour: '2-digit', 
          minute: '2-digit'
        });
        
        messageElement.innerHTML = `
          <div class="message-header">
            <span class="message-role">${message.role === 'user' ? 'You' : agentName}</span>
            <span class="message-time">${messageTime}</span>
          </div>
          <div class="message-content">${formatMessageContent(message.content)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
      }
    }
    
    // Clear previous content
    conversationDetail.innerHTML = '';
    
    // Add header and messages
    conversationDetail.appendChild(header);
    conversationDetail.appendChild(messagesContainer);
    
    // Add event listeners for action buttons
    document.getElementById('rejoinBtn').addEventListener('click', () => rejoinConversation(conversation.id));
    document.getElementById('exportBtn').addEventListener('click', () => exportConversation(conversation.id));
    document.getElementById('deleteBtn').addEventListener('click', () => deleteConversation(conversation.id));
    
    // Scroll to bottom of messages
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
   * Delete a conversation
   */
  async function deleteConversation(conversationId) {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DELETE_CONVERSATION',
        conversationId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete conversation');
      }
      
      // Remove from conversations array
      conversations = conversations.filter(c => c.id !== conversationId);
      
      // Update count
      conversationCount.textContent = `${conversations.length} Conversation${conversations.length !== 1 ? 's' : ''}`;
      
      // Clear selection
      selectedConversationId = null;
      
      // Re-render conversation list
      renderConversationList();
      
      // Show empty detail
      showEmptyDetail();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Error deleting conversation: ' + error.message);
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