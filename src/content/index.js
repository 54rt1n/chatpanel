/**
 * Content Script Entry Point
 * 
 * This is the main entry point for the content script that injects
 * the AI assistant panel into web pages.
 */

import PanelManager from './panel-manager';
import MessageHandler from './message-handler';

// Initialize global instances
const panelManager = new PanelManager();
const messageHandler = new MessageHandler(panelManager);

// Wait for the DOM to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/**
 * Initialize the content script
 */
function initialize() {
  console.log('AI Assistant content script initialized');
  
  // Set up message listener for communication with background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    return messageHandler.handleMessage(message, sender, sendResponse);
  });
  
  // Listen for chat messages from the panel
  document.addEventListener('ai_assistant_chat', (event) => {
    messageHandler.handleChatEvent(event);
  });
  

  // Listen for panel toggle events from popup
  document.addEventListener('ai_assistant_toggle_panel', (event) => {
    console.log('Toggle panel event received', event.detail);
    const { agents, activeAgentId } = event.detail;
    
    // Get the active agent's conversation ID
    const activeAgent = agents.find(a => a.id === activeAgentId);
    const conversationId = activeAgent ? activeAgent.currentConversationId : null;
    
    // Toggle panel visibility
    panelManager.togglePanel(agents, activeAgentId, conversationId);
  });

  // Add cleanup handler for page unload
  window.addEventListener('beforeunload', () => {
    console.log('Page unloading, cleaning up panel');
    panelManager.removePanel();
    // Notify background script
    try {
      chrome.runtime.sendMessage({ action: 'LEAVE_PANEL' });
    } catch (error) {
      console.error('Error sending leave panel message:', error);
    }
  });
}

/**
 * Gather page information for chat context
 */
export function gatherPageInfo() {
  console.log('Gathering page information');
  const info = {
    url: window.location.href,
    text: document.body.innerText.slice(0, 3000), // Limit to 3000 chars
    title: document.title
  };
  console.log('Page info gathered:', {
    url: info.url,
    title: info.title,
    textLength: info.text.length
  });
  return info;
}

// Helper function to safely escape HTML and preserve formatting
export function formatContent(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

// Export for testing
export { panelManager, messageHandler };