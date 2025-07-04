/**
 * Popup Script
 * 
 * Handles the popup UI and interactions
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI elements
  const analyzeBtn = document.getElementById('analyzeBtn');
  const chatBtn = document.getElementById('chatBtn');
  const optionsBtn = document.getElementById('optionsBtn');
  const mcpTestBtn = document.getElementById('mcpTestBtn');
  const historyBtn = document.getElementById('historyBtn');
  const agentSelect = document.getElementById('agent-select');
  const loadingEl = document.getElementById('loading');
  const statusEl = document.getElementById('status');

  // Get current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  // Check for URL parameters (for rejoining conversations)
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const conversationId = urlParams.get('conversationId');
  
  // If we have a rejoin action, handle it immediately
  if (action === 'rejoin' && conversationId) {
    try {
      loadingEl.style.display = 'flex';
      showStatus('Rejoining conversation...', false);
      
      // Send message to rejoin the conversation
      const response = await chrome.runtime.sendMessage({
        action: 'REJOIN_CONVERSATION',
        conversationId
      });
      
      if (response.success) {
        showStatus('Successfully rejoined conversation', false);
        
        // Wait a bit, then try to get the agents and open the chat panel
        setTimeout(async () => {
          try {
            // Get agents info
            const agentsResponse = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
            
            if (agentsResponse.success) {
              // Find the active tab
              const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
              if (currentTabs.length > 0) {
                // Send message to open chat panel with the conversation
                await chrome.tabs.sendMessage(currentTabs[0].id, {
                  action: 'OPEN_CHAT_PANEL',
                  agents: agentsResponse.agents,
                  activeAgentId: response.agentId
                });
                
                // Close popup
                window.close();
              }
            }
          } catch (err) {
            console.error('Error opening chat panel:', err);
          }
        }, 500);
      } else {
        showStatus('Failed to rejoin conversation: ' + (response.error || 'Unknown error'), true);
        loadingEl.style.display = 'none';
      }
    } catch (error) {
      console.error('Error rejoining conversation:', error);
      showStatus('Error rejoining conversation: ' + error.message, true);
      loadingEl.style.display = 'none';
    }
  }

  // Initialize agent selector
  await initializeAgentSelector();

  // Button click handlers
  analyzeBtn.addEventListener('click', () => analyzeCurrentPage());
  chatBtn.addEventListener('click', () => openChatPanel());
  optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  mcpTestBtn.addEventListener('click', () => chrome.tabs.create({ url: 'mcp_status.html' }));
  historyBtn.addEventListener('click', () => chrome.tabs.create({ url: 'history.html' }));

  // Agent selector change handler
  agentSelect.addEventListener('change', async () => {
    await setActiveAgent(agentSelect.value);
  });

  /**
   * Initialize agent selector dropdown
   */
  async function initializeAgentSelector() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
      
      if (response.success && response.agents) {
        // Clear existing options
        agentSelect.innerHTML = '';
        
        // Add agent options
        response.agents.forEach(agent => {
          const option = document.createElement('option');
          option.value = agent.id;
          option.textContent = agent.name;
          
          // Set selected if this is the active agent
          if (agent.id === response.activeAgentId) {
            option.selected = true;
          }
          
          agentSelect.appendChild(option);
        });
      } else {
        showStatus('Failed to load agents', true);
      }
    } catch (error) {
      console.error('Error initializing agent selector:', error);
      showStatus('Error loading agents', true);
    }
  }

  /**
   * Set the active agent
   */
  async function setActiveAgent(agentId) {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'SWITCH_AGENT', 
        agentId 
      });
      
      if (!response.success) {
        showStatus('Failed to switch agent', true);
      }
    } catch (error) {
      console.error('Error setting active agent:', error);
      showStatus('Error switching agent', true);
    }
  }

  /**
   * Analyze the current page
   */
  async function analyzeCurrentPage() {
    try {
      // Show loading state
      analyzeBtn.disabled = true;
      loadingEl.style.display = 'flex';
      showStatus('');
      
      // Get the currently selected agent
      const agentId = agentSelect.value;
      
      // Capture page content
      const pageData = await capturePageContent();
      if (!pageData) {
        throw new Error('Failed to capture page content');
      }
      
      // Send to background script for analysis
      const response = await chrome.runtime.sendMessage({
        action: 'ANALYZE_PAGE',
        data: pageData,
        tabId: activeTab.id,
        agentId
      });
      
      if (response.success) {
        showStatus('Analysis started in chat panel', false);
        
        // Open the chat panel
        await openChatPanel();
      } else {
        showStatus('Analysis failed: ' + (response.error || 'Unknown error'), true);
      }
    } catch (error) {
      console.error('Error analyzing page:', error);
      showStatus('Error: ' + error.message, true);
    } finally {
      // Reset UI state
      analyzeBtn.disabled = false;
      loadingEl.style.display = 'none';
    }
  }

  /**
   * Capture content from the current page
   */
  async function capturePageContent() {
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'CAPTURE_PAGE' });
      return response.success ? response.data : null;
    } catch (error) {
      console.error('Error capturing page content:', error);
      return null;
    }
  }

  /**
   * Open the chat panel on the current tab
   */
async function openChatPanel() {
  try {
    // Get agents info to pass to content script
    const response = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
    
    if (!response.success) {
      throw new Error('Failed to get agents information');
    }
    
    console.log('Got agents, sending OPEN_CHAT_PANEL message to tab', activeTab.id);
    
    // Use a direct message to the content script instead of executeScript
    const result = await chrome.tabs.sendMessage(activeTab.id, {
      action: 'OPEN_CHAT_PANEL',
      agents: response.agents,
      activeAgentId: response.activeAgentId
    });
    
    console.log('Response from content script:', result);
    
    // Close popup
    window.close();
  } catch (error) {
    console.error('Error opening chat panel:', error);
    showStatus('Error opening chat panel: ' + error.message, true);
  }
}

  /**
   * Show status message
   */
  function showStatus(message, isError = false) {
    if (!message) {
      statusEl.style.display = 'none';
      return;
    }
    
    statusEl.textContent = message;
    statusEl.className = `status ${isError ? 'error' : 'success'}`;
    statusEl.style.display = 'block';
  }
});