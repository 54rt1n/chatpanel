import api from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('historyContainer');

  // Helper function to safely escape HTML
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>");
  }

  // Function to save conversation to API
  async function saveConversation(conversationId, messages) {
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save conversation');
      }

      return response.json();
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }

  // Function to delete a message from history
  async function deleteMessage(timestamp) {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    const updatedHistory = messageHistory.filter(msg => msg.timestamp !== timestamp);
    await chrome.storage.local.set({ messageHistory: updatedHistory });
    return updatedHistory;
  }

  // Function to render history
  async function renderHistory() {
    const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
    console.log('Loaded message history:', messageHistory.length, 'messages');

    if (messageHistory.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No chat history yet.</p>
          <p>Start a conversation in the assistant panel to see your history here.</p>
        </div>
      `;
      return;
    }

    // Sort messages by timestamp, newest first
    const sortedHistory = [...messageHistory].sort((a, b) => b.timestamp - a.timestamp);

    // Group messages by conversation ID
    const conversationGroups = sortedHistory.reduce((groups, item) => {
      const id = item.conversationId || 'no_conversation';
      if (!groups[id]) {
        groups[id] = [];
      }
      groups[id].push(item);
      return groups;
    }, {});

    // Create HTML for each history item
    const historyHTML = sortedHistory.map(item => {
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();
      
      // Safely escape all user-generated content
      const safeUrl = escapeHtml(item.url || '');
      const safeTitle = escapeHtml(item.title || 'Untitled Page');
      const safeMessage = escapeHtml(item.message || '');
      const safeResponse = escapeHtml(item.response || '');
      const safeConversationId = escapeHtml(item.conversationId || 'No conversation ID');
      
      // Add saved state classes
      const saveButtonClasses = ['save-btn'];
      if (item.saved) {
        saveButtonClasses.push('saved');
      }
      
      return `
        <div class="history-item" data-timestamp="${item.timestamp}" data-conversation-id="${safeConversationId}">
          <button class="${saveButtonClasses.join(' ')}" title="Save conversation to API" ${item.saved ? 'disabled' : ''}>
            ${item.saved ? 'Saved' : 'Save'}
          </button>
          <button class="delete-btn" title="Delete this message">×</button>
          <div class="history-header">
            <div class="page-info">
              <a href="${safeUrl}" target="_blank" title="${safeUrl}">${safeTitle}</a>
            </div>
            <div class="meta-info">
              <div class="timestamp">${formattedDate}</div>
              <div class="conversation-id" title="Conversation ID">${safeConversationId}</div>
            </div>
          </div>
          <div class="message">
            <strong>You:</strong><br>
            <div class="message-content">${safeMessage}</div>
          </div>
          <div class="response">
            <strong>Assistant:</strong><br>
            <div class="response-content">${safeResponse}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = historyHTML;
  }

  // Initial render
  await renderHistory();

  // Handle message deletion and saving using event delegation
  container.addEventListener('click', async (event) => {
    if (event.target.matches('.delete-btn')) {
      const item = event.target.closest('.history-item');
      if (!item) return;

      const timestamp = parseInt(item.dataset.timestamp);
      if (confirm('Are you sure you want to delete this message?')) {
        await deleteMessage(timestamp);
        await renderHistory();
      }
    }
    else if (event.target.matches('.save-btn:not(.saved)')) {
      const saveBtn = event.target;
      const item = saveBtn.closest('.history-item');
      if (!item) return;

      const conversationId = item.dataset.conversationId;
      if (!conversationId || conversationId === 'No conversation ID') {
        alert('Cannot save: No conversation ID available');
        return;
      }

      // Get this specific message from history
      const { messageHistory = [] } = await chrome.storage.local.get('messageHistory');
      const timestamp = parseInt(item.dataset.timestamp);
      const currentMessage = messageHistory.find(msg => msg.timestamp === timestamp);
      
      if (!currentMessage) {
        alert('Cannot save: Message not found');
        return;
      }

      // Create the message pair for this turn
      const messages = [
        {
          role: 'user',
          content: currentMessage.message,
          timestamp: currentMessage.timestamp
        },
        {
          role: 'assistant',
          content: currentMessage.response,
          timestamp: currentMessage.timestamp
        }
      ];

      try {
        saveBtn.textContent = 'Saving...';
        saveBtn.classList.add('saving');
        saveBtn.disabled = true;

        await api.saveConversation(conversationId, messages);
        
        // Mark the message as saved in storage
        await chrome.runtime.sendMessage({
          action: 'MARK_MESSAGE_SAVED',
          timestamp: timestamp
        });
        
        saveBtn.textContent = 'Saved';
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('saved');
        saveBtn.disabled = true;
      } catch (error) {
        console.error('Failed to save conversation:', error);
        alert('Failed to save conversation: ' + error.message);
        saveBtn.textContent = 'Save';
        saveBtn.classList.remove('saving');
        saveBtn.disabled = false;
      }
    }
  });

  // Add some debug info
  console.log('History page initialized');
}); 