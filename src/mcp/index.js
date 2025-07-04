/**
 * MCP Test Page Script
 * 
 * Provides a comprehensive test interface for MCP functionality
 */

// Import MCP connector
import MCPConnector from '../background/mcp-connector.js';

// Global state
let mcpConnector = null;
let selectedAgent = null;
let agents = [];
let conversationId = null;

// DOM elements
const mcpUrlInput = document.getElementById('mcpUrl');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionMessage = document.getElementById('connectionMessage');
const agentsList = document.getElementById('agentsList');
const refreshAgentsBtn = document.getElementById('refreshAgents');
const listToolsBtn = document.getElementById('listToolsBtn');
const toolsContainer = document.getElementById('toolsContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const clearChatBtn = document.getElementById('clearChatBtn');

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadAgents();
  generateConversationId();
  loadMcpSettings();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  connectBtn.addEventListener('click', connectToMCP);
  disconnectBtn.addEventListener('click', disconnectFromMCP);
  refreshAgentsBtn.addEventListener('click', loadAgents);
  listToolsBtn.addEventListener('click', listTools);
  sendChatBtn.addEventListener('click', sendChatMessage);
  clearChatBtn.addEventListener('click', clearChat);
  
  // Enter key for chat input
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

/**
 * Generate a new conversation ID
 */
function generateConversationId() {
  conversationId = 'mcp_test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  console.log('Generated conversation ID:', conversationId);
}

/**
 * Update connection status display
 */
function updateConnectionStatus(status, message = '') {
  connectionStatus.className = `connection-status ${status}`;
  connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  
  if (message) {
    connectionMessage.textContent = message;
    connectionMessage.className = `status ${status === 'connected' ? 'success' : status === 'connecting' ? 'info' : 'error'}`;
    connectionMessage.style.display = 'block';
  } else {
    connectionMessage.style.display = 'none';
  }
}

/**
 * Show status message
 */
function showStatus(element, message, type = 'info') {
  element.innerHTML = `<div class="status ${type}">${message}</div>`;
}

/**
 * Load MCP settings from storage
 */
async function loadMcpSettings() {
  try {
    const settings = await chrome.storage.local.get(['mcpServerUrl']);
    if (settings.mcpServerUrl) {
      mcpUrlInput.value = settings.mcpServerUrl;
      // If we're already connected to a different URL, show a notice
      if (mcpConnector && mcpConnector.mcpServerUrl !== settings.mcpServerUrl) {
        showStatus(connectionMessage, 'Connected to a different MCP server than the global setting', 'warning');
      }
    }
  } catch (error) {
    console.error('Error loading MCP settings:', error);
  }
}

/**
 * Connect to MCP server
 */
async function connectToMCP() {
  const url = mcpUrlInput.value.trim();
  if (!url) {
    updateConnectionStatus('disconnected', 'Please enter a valid MCP server URL');
    return;
  }

  try {
    updateConnectionStatus('connecting', 'Connecting to MCP server...');
    connectBtn.disabled = true;

    // Save the URL to global settings if it's different
    const settings = await chrome.storage.local.get(['mcpServerUrl']);
    if (settings.mcpServerUrl !== url) {
      await chrome.storage.local.set({ mcpServerUrl: url });
    }

    // Create new MCP connector
    mcpConnector = new MCPConnector(url);
    
    // Initialize the connection
    const tools = await mcpConnector.initialize();
    
    updateConnectionStatus('connected', `Connected! Found ${tools.length} tools`);
    disconnectBtn.disabled = false;
    listToolsBtn.disabled = false;
    
    // Update chat interface if we have a selected MCP agent
    updateChatInterface();
    
    console.log('MCP connection established:', tools);
  } catch (error) {
    console.error('Failed to connect to MCP:', error);
    updateConnectionStatus('disconnected', `Connection failed: ${error.message}`);
    connectBtn.disabled = false;
    mcpConnector = null;
  }
}

/**
 * Disconnect from MCP server
 */
function disconnectFromMCP() {
  if (mcpConnector) {
    mcpConnector.disconnect();
    mcpConnector = null;
  }
  
  updateConnectionStatus('disconnected', 'Disconnected from MCP server');
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  listToolsBtn.disabled = true;
  
  // Clear tools display
  showStatus(toolsContainer, 'Connect to MCP server to see available tools');
  
  // Update chat interface
  updateChatInterface();
}

/**
 * Load agents from extension
 */
async function loadAgents() {
  try {
    showStatus(agentsList, 'Loading agents...', 'info');
    
    // Get agents from the extension
    const response = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
    
    if (response.success) {
      agents = response.agents;
      renderAgentsList();
    } else {
      showStatus(agentsList, 'Failed to load agents: ' + (response.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Error loading agents:', error);
    showStatus(agentsList, 'Error loading agents: ' + error.message, 'error');
  }
}

/**
 * Render the agents list
 */
function renderAgentsList() {
  if (agents.length === 0) {
    showStatus(agentsList, 'No agents found. Please configure agents in the options page.', 'info');
    return;
  }

  agentsList.innerHTML = '';
  
  agents.forEach(agent => {
    const agentItem = document.createElement('div');
    agentItem.className = 'agent-item';
    agentItem.dataset.agentId = agent.id;
    
    if (agent.backendType === 'mcp') {
      agentItem.classList.add('mcp-agent');
    }
    
    agentItem.innerHTML = `
      <div class="agent-name">${agent.name}</div>
      <div class="agent-type">${agent.backendType === 'mcp' ? 'MCP Agent' : 'Standard Agent'}</div>
      ${agent.mcpServerUrl ? `<div class="agent-url">${agent.mcpServerUrl}</div>` : ''}
    `;
    
    agentItem.addEventListener('click', () => selectAgent(agent));
    agentsList.appendChild(agentItem);
  });
}

/**
 * Select an agent
 */
function selectAgent(agent) {
  selectedAgent = agent;
  
  // Update UI
  document.querySelectorAll('.agent-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const agentItem = document.querySelector(`[data-agent-id="${agent.id}"]`);
  if (agentItem) {
    agentItem.classList.add('active');
  }
  
  updateChatInterface();
  generateConversationId(); // Start fresh conversation
  clearChat();
  
  console.log('Selected agent:', agent);
}

/**
 * Update chat interface based on current state
 */
function updateChatInterface() {
  const canChat = selectedAgent && 
                 ((selectedAgent.backendType === 'mcp' && mcpConnector) || 
                  selectedAgent.backendType === 'standard');
  
  chatInput.disabled = !canChat;
  sendChatBtn.disabled = !canChat;
  
  if (!canChat) {
    if (!selectedAgent) {
      showStatus(chatMessages, 'Select an agent to start chatting', 'info');
    } else if (selectedAgent.backendType === 'mcp' && !mcpConnector) {
      showStatus(chatMessages, 'Connect to MCP server to chat with MCP agents', 'info');
    }
  }
}

/**
 * List available tools from MCP server
 */
async function listTools() {
  if (!mcpConnector) {
    showStatus(toolsContainer, 'Not connected to MCP server', 'error');
    return;
  }

  try {
    showStatus(toolsContainer, 'Loading tools...', 'info');
    
    const tools = mcpConnector.getTools();
    
    if (tools.length === 0) {
      showStatus(toolsContainer, 'No tools available from MCP server', 'info');
      return;
    }

    // Render tools list
    const toolsList = document.createElement('div');
    toolsList.className = 'tools-list';
    
    tools.forEach(tool => {
      const toolItem = document.createElement('div');
      toolItem.className = 'tool-item';
      
      toolItem.innerHTML = `
        <div class="tool-name">${tool.function.name}</div>
        <div class="tool-description">${tool.function.description || 'No description provided'}</div>
        <div class="tool-parameters">${JSON.stringify(tool.function.parameters, null, 2)}</div>
      `;
      
      toolsList.appendChild(toolItem);
    });
    
    toolsContainer.innerHTML = '';
    toolsContainer.appendChild(toolsList);
    
    console.log('Listed tools:', tools);
  } catch (error) {
    console.error('Error listing tools:', error);
    showStatus(toolsContainer, 'Error listing tools: ' + error.message, 'error');
  }
}

/**
 * Send a chat message
 */
async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message || !selectedAgent) return;

  try {
    // Clear input
    chatInput.value = '';
    
    // Add user message to chat
    addChatMessage('user', message);
    
    // Show loading
    const loadingMsg = addChatMessage('assistant', 'Thinking...');
    loadingMsg.classList.add('loading');

    // Send message to extension
    const response = await chrome.runtime.sendMessage({
      action: 'CHAT_MESSAGE',
      data: {
        message: message,
        url: window.location.href,
        pageContent: 'MCP Test Page',
        title: 'MCP Test',
        conversationId: conversationId,
        agentId: selectedAgent.id
      }
    });

    // Remove loading message
    loadingMsg.remove();

    if (response.success) {
      // The response will be streamed through the extension's normal flow
      // For now, just show a success indicator
      addChatMessage('assistant', 'Message sent successfully. Check the extension panel for the response.');
    } else {
      addChatMessage('error', 'Error: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error sending chat message:', error);
    addChatMessage('error', 'Error sending message: ' + error.message);
  }
}

/**
 * Add a message to the chat display
 */
function addChatMessage(type, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  const typeLabel = type === 'user' ? 'You' : type === 'assistant' ? 'Assistant' : 'Error';
  
  messageDiv.innerHTML = `
    <strong>${typeLabel}</strong> <small>${timestamp}</small><br>
    ${content.replace(/\n/g, '<br>')}
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  return messageDiv;
}

/**
 * Clear chat messages
 */
function clearChat() {
  chatMessages.innerHTML = '';
  if (selectedAgent) {
    addChatMessage('assistant', `Chat cleared. You're now talking to ${selectedAgent.name}.`);
  }
}

// Handle messages from the extension (for streaming responses)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'STREAM_CONTENT' && message.agentId === selectedAgent?.id) {
    // Remove any existing loading messages
    const loadingMsgs = chatMessages.querySelectorAll('.loading');
    loadingMsgs.forEach(msg => msg.remove());
    
    if (message.isFirst) {
      addChatMessage('assistant', message.content);
    } else {
      // Update the last assistant message
      const lastAssistantMsg = [...chatMessages.querySelectorAll('.chat-message.assistant')].pop();
      if (lastAssistantMsg) {
        const content = lastAssistantMsg.innerHTML.split('<br>').slice(1).join('<br>') + message.content.replace(/\n/g, '<br>');
        lastAssistantMsg.innerHTML = lastAssistantMsg.innerHTML.split('<br>')[0] + '<br>' + content;
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  } else if (message.action === 'SHOW_ERROR' && message.agentId === selectedAgent?.id) {
    // Remove any existing loading messages
    const loadingMsgs = chatMessages.querySelectorAll('.loading');
    loadingMsgs.forEach(msg => msg.remove());
    
    addChatMessage('error', message.error);
  }
});

console.log('MCP Test Page initialized'); 