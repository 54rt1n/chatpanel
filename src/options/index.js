/**
 * Options Page Script
 * 
 * Handles options page UI and interactions for configuring
 * the extension and managing agents
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Connection settings
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  
  // User settings
  const userIdInput = document.getElementById('userId');
  
  // Agents list
  const agentsList = document.getElementById('agentsList');
  const addAgentBtn = document.getElementById('addAgentBtn');
  const agentTemplate = document.getElementById('agentTemplate');
  
  // Save button
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load existing settings
  await loadSettings();

  // Helper function to show status message
  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.className = `status ${isError ? 'error' : 'success'}`;
    status.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  };

  // Helper function to validate URL
  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Helper function to validate number input
  const validateNumberInput = (input, min, max, fieldName) => {
    if (!input || input.value === '') return true; // Optional fields can be empty
    const value = parseFloat(input.value);
    if (isNaN(value)) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  };

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    try {
      // Get connection and user settings
      const settings = await chrome.storage.local.get([
        'apiEndpoint', 
        'apiKey', 
        'userId'
      ]);
      
      if (settings.apiEndpoint) apiEndpointInput.value = settings.apiEndpoint;
      if (settings.apiKey) apiKeyInput.value = settings.apiKey;
      if (settings.userId) userIdInput.value = settings.userId || 'default_user';
      
      // Get agents
      const response = await chrome.runtime.sendMessage({ action: 'GET_AGENTS' });
      
      if (response.success && response.agents) {
        renderAgentsList(response.agents);
      } else {
        showStatus('Failed to load agents. Using default configuration.', true);
        // Create a default agent
        const defaultAgent = {
          id: 'agent_' + Date.now(),
          name: 'AI Assistant',
          model: 'gpt-3.5-turbo',
          systemMessage: 'You are a helpful assistant that analyzes webpage content.',
          temperature: 0.7,
          stream: true
        };
        renderAgentsList([defaultAgent]);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings: ' + error.message, true);
    }
  }

  /**
   * Render the list of agents
   */
  function renderAgentsList(agents) {
    // Clear existing agents
    agentsList.innerHTML = '';
    
    // Render each agent
    agents.forEach(agent => {
      const agentItem = renderAgentItem(agent);
      agentsList.appendChild(agentItem);
    });
  }

  /**
   * Render a single agent item
   */
  function renderAgentItem(agent) {
    // Clone the template
    const agentItem = agentTemplate.content.cloneNode(true).querySelector('.agent-item');
    agentItem.dataset.agentId = agent.id;
    
    // Set agent name
    const nameInput = agentItem.querySelector('.agent-name-input');
    nameInput.value = agent.name || '';
    
    // Set model
    const modelInput = agentItem.querySelector('.agent-model');
    modelInput.value = agent.model || '';
    
    // Set temperature
    const temperatureInput = agentItem.querySelector('.agent-temperature');
    temperatureInput.value = agent.temperature !== undefined ? agent.temperature : '';
    
    // Set max tokens
    const maxTokensInput = agentItem.querySelector('.agent-max-tokens');
    maxTokensInput.value = agent.maxTokens !== undefined ? agent.maxTokens : '';
    
    // Set top p
    const topPInput = agentItem.querySelector('.agent-top-p');
    topPInput.value = agent.topP !== undefined ? agent.topP : '';
    
    // Set system message
    const systemMessageInput = agentItem.querySelector('.agent-system-message');
    systemMessageInput.value = agent.systemMessage || '';
    
    // Set advanced settings
    const topKInput = agentItem.querySelector('.agent-top-k');
    topKInput.value = agent.topK !== undefined ? agent.topK : '';
    
    const presencePenaltyInput = agentItem.querySelector('.agent-presence-penalty');
    presencePenaltyInput.value = agent.presencePenalty !== undefined ? agent.presencePenalty : '';
    
    const frequencyPenaltyInput = agentItem.querySelector('.agent-frequency-penalty');
    frequencyPenaltyInput.value = agent.frequencyPenalty !== undefined ? agent.frequencyPenalty : '';
    
    const repetitionPenaltyInput = agentItem.querySelector('.agent-repetition-penalty');
    repetitionPenaltyInput.value = agent.repetitionPenalty !== undefined ? agent.repetitionPenalty : '';
    
    const minPInput = agentItem.querySelector('.agent-min-p');
    minPInput.value = agent.minP !== undefined ? agent.minP : '';
    
    const streamCheckbox = agentItem.querySelector('.agent-stream');
    streamCheckbox.checked = agent.stream !== undefined ? agent.stream : true;
    
    // Set up event listeners
    
    // Toggle advanced settings
    const advancedToggle = agentItem.querySelector('.advanced-toggle');
    const advancedSettings = agentItem.querySelector('.advanced-settings');
    
    advancedToggle.addEventListener('click', () => {
      const isHidden = advancedSettings.style.display === 'none';
      advancedSettings.style.display = isHidden ? 'block' : 'none';
      advancedToggle.textContent = isHidden ? 'Hide Advanced Settings' : 'Show Advanced Settings';
    });
    
    // Toggle collapse
    const collapseBtn = agentItem.querySelector('.collapse-btn');
    const agentConfig = agentItem.querySelector('.agent-config');
    const systemMessageSection = agentItem.querySelector('.config-section.full-width');
    
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = agentConfig.style.display === 'none';
      agentConfig.style.display = isCollapsed ? 'grid' : 'none';
      systemMessageSection.style.display = isCollapsed ? 'block' : 'none';
      advancedSettings.style.display = 'none';
      advancedToggle.textContent = 'Show Advanced Settings';
      collapseBtn.textContent = isCollapsed ? '▼' : '▶';
    });
    
    // Delete agent
    const deleteBtn = agentItem.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async () => {
      const agentCount = agentsList.querySelectorAll('.agent-item').length;
      
      if (agentCount <= 1) {
        showStatus('Cannot delete the last agent. At least one agent is required.', true);
        return;
      }
      
      if (confirm(`Delete agent "${nameInput.value}"?`)) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'REMOVE_AGENT',
            agentId: agent.id
          });
          
          if (response.success) {
            agentItem.remove();
            showStatus(`Agent "${nameInput.value}" deleted.`);
          } else {
            showStatus('Failed to delete agent: ' + (response.error || 'Unknown error'), true);
          }
        } catch (error) {
          console.error('Error deleting agent:', error);
          showStatus('Error deleting agent: ' + error.message, true);
        }
      }
    });
    
    return agentItem;
  }

  /**
   * Create a new agent
   */
  async function createNewAgent() {
    const newAgent = {
      name: 'New Agent',
      model: 'gpt-3.5-turbo',
      systemMessage: 'You are a helpful assistant that analyzes webpage content.',
      temperature: 0.7,
      stream: true
    };
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ADD_AGENT',
        config: newAgent
      });
      
      if (response.success) {
        const agentItem = renderAgentItem(response.agent);
        agentsList.appendChild(agentItem);
        showStatus('New agent added.');
        
        // Auto-focus the name input
        setTimeout(() => {
          const nameInput = agentItem.querySelector('.agent-name-input');
          nameInput.focus();
          nameInput.select();
        }, 100);
        
        return response.agent;
      } else {
        showStatus('Failed to add agent: ' + (response.error || 'Unknown error'), true);
        return null;
      }
    } catch (error) {
      console.error('Error adding agent:', error);
      showStatus('Error adding agent: ' + error.message, true);
      return null;
    }
  }

  // Add new agent button
  addAgentBtn.addEventListener('click', () => createNewAgent());

  // Save all settings
  saveBtn.addEventListener('click', async () => {
    try {
      // Validate connection settings
      const apiEndpoint = apiEndpointInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      const userId = userIdInput.value.trim();
      
      if (!apiEndpoint || !isValidUrl(apiEndpoint)) {
        showStatus('Invalid API endpoint URL', true);
        apiEndpointInput.focus();
        return;
      }
      
      if (!apiKey) {
        showStatus('Please enter an API key', true);
        apiKeyInput.focus();
        return;
      }
      
      if (!userId) {
        showStatus('Please enter a user ID', true);
        userIdInput.focus();
        return;
      }
      
      // Save connection and user settings
      await chrome.storage.local.set({
        apiEndpoint,
        apiKey,
        userId
      });
      
      // Validate and collect agent configurations
      const agentItems = agentsList.querySelectorAll('.agent-item');
      let hasUpdateErrors = false;
      
      for (const item of agentItems) {
        const agentId = item.dataset.agentId;
        
        const nameInput = item.querySelector('.agent-name-input');
        const modelInput = item.querySelector('.agent-model');
        const systemMessageInput = item.querySelector('.agent-system-message');
        
        if (!nameInput.value.trim()) {
          showStatus('Agent name cannot be empty', true);
          nameInput.focus();
          return;
        }
        
        if (!modelInput.value.trim()) {
          showStatus('Model name cannot be empty', true);
          modelInput.focus();
          return;
        }
        
        // Validate number inputs
        const numberInputs = [
          { input: item.querySelector('.agent-temperature'), min: 0, max: 2, name: 'Temperature' },
          { input: item.querySelector('.agent-max-tokens'), min: 1, name: 'Max tokens' },
          { input: item.querySelector('.agent-top-p'), min: 0, max: 1, name: 'Top P' },
          { input: item.querySelector('.agent-top-k'), min: 1, name: 'Top K' },
          { input: item.querySelector('.agent-presence-penalty'), min: -2, max: 2, name: 'Presence penalty' },
          { input: item.querySelector('.agent-frequency-penalty'), min: -2, max: 2, name: 'Frequency penalty' },
          { input: item.querySelector('.agent-repetition-penalty'), min: 1, name: 'Repetition penalty' },
          { input: item.querySelector('.agent-min-p'), min: 0, max: 1, name: 'Min P' }
        ];
        
        for (const validation of numberInputs) {
          if (!validateNumberInput(validation.input, validation.min, validation.max, validation.name)) {
            showStatus(`Invalid ${validation.name} value for agent "${nameInput.value}"`, true);
            validation.input.focus();
            return;
          }
        }
        
        // Create updated agent config
        const updatedConfig = {
          name: nameInput.value.trim(),
          model: modelInput.value.trim(),
          systemMessage: systemMessageInput.value.trim(),
          stream: item.querySelector('.agent-stream').checked
        };
        
        // Add optional numeric fields
        const numberFields = {
          temperature: '.agent-temperature',
          maxTokens: '.agent-max-tokens',
          topP: '.agent-top-p',
          topK: '.agent-top-k',
          presencePenalty: '.agent-presence-penalty',
          frequencyPenalty: '.agent-frequency-penalty',
          repetitionPenalty: '.agent-repetition-penalty',
          minP: '.agent-min-p'
        };
        
        for (const [key, selector] of Object.entries(numberFields)) {
          const input = item.querySelector(selector);
          if (input && input.value.trim() !== '') {
            updatedConfig[key] = parseFloat(input.value);
          } else {
            // If field was cleared, set to null to remove it
            updatedConfig[key] = null;
          }
        }
        
        // Update agent
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'UPDATE_AGENT',
            agentId,
            updates: updatedConfig
          });
          
          if (!response.success) {
            console.error('Failed to update agent:', response.error);
            hasUpdateErrors = true;
          }
        } catch (error) {
          console.error('Error updating agent:', error);
          hasUpdateErrors = true;
        }
      }
      
      if (hasUpdateErrors) {
        showStatus('Some agent updates failed. Please check console for details.', true);
      } else {
        showStatus('All settings saved successfully');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus(`Error saving settings: ${error.message}`, true);
    }
  });
});