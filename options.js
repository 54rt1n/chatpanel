document.addEventListener('DOMContentLoaded', () => {
  // Connection settings
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  
  // User settings
  const userIdInput = document.getElementById('userId');
  const personaIdInput = document.getElementById('personaId');
  
  // Model settings
  const modelInput = document.getElementById('model');
  const systemMessageInput = document.getElementById('systemMessage');
  
  // Generation parameters
  const temperatureInput = document.getElementById('temperature');
  const maxTokensInput = document.getElementById('maxTokens');
  const topPInput = document.getElementById('topP');
  const topKInput = document.getElementById('topK');
  const presencePenaltyInput = document.getElementById('presencePenalty');
  const frequencyPenaltyInput = document.getElementById('frequencyPenalty');
  const repetitionPenaltyInput = document.getElementById('repetitionPenalty');
  const minPInput = document.getElementById('minP');
  const streamCheckbox = document.getElementById('stream');
  
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.local.get([
    'apiEndpoint',
    'apiKey',
    'userId',
    'personaId',
    'model',
    'systemMessage',
    'temperature',
    'maxTokens',
    'topP',
    'topK',
    'presencePenalty',
    'frequencyPenalty',
    'repetitionPenalty',
    'minP',
    'stream'
  ], (result) => {
    // Connection settings
    if (result.apiEndpoint) apiEndpointInput.value = result.apiEndpoint;
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    
    // User settings
    if (result.userId) userIdInput.value = result.userId;
    if (result.personaId) personaIdInput.value = result.personaId;
    
    // Model settings
    if (result.model) modelInput.value = result.model;
    if (result.systemMessage) systemMessageInput.value = result.systemMessage;
    
    // Generation parameters
    if (result.temperature !== undefined) temperatureInput.value = result.temperature;
    if (result.maxTokens !== undefined) maxTokensInput.value = result.maxTokens;
    if (result.topP !== undefined) topPInput.value = result.topP;
    if (result.topK !== undefined) topKInput.value = result.topK;
    if (result.presencePenalty !== undefined) presencePenaltyInput.value = result.presencePenalty;
    if (result.frequencyPenalty !== undefined) frequencyPenaltyInput.value = result.frequencyPenalty;
    if (result.repetitionPenalty !== undefined) repetitionPenaltyInput.value = result.repetitionPenalty;
    if (result.minP !== undefined) minPInput.value = result.minP;
    if (result.stream !== undefined) streamCheckbox.checked = result.stream;
  });

  // Helper function to show status message
  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.className = `status ${isError ? 'error' : 'success'}`;
    status.style.display = 'block';
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
    if (input.value === '') return true; // Optional fields can be empty
    const value = parseFloat(input.value);
    if (isNaN(value)) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  };

  // Save settings
  saveBtn.addEventListener('click', () => {
    // Get all values
    const apiEndpoint = apiEndpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const userId = userIdInput.value.trim();
    const personaId = personaIdInput.value.trim();
    const model = modelInput.value.trim();
    const systemMessage = systemMessageInput.value.trim();
    
    // Validate required fields
    if (!apiEndpoint || !isValidUrl(apiEndpoint)) {
      showStatus('Invalid API endpoint URL', true);
      return;
    }
    if (!apiKey) {
      showStatus('Please enter an API key', true);
      return;
    }
    if (!userId) {
      showStatus('Please enter a user ID', true);
      return;
    }
    if (!personaId) {
      showStatus('Please enter a persona ID', true);
      return;
    }
    if (!model) {
      showStatus('Please enter a model name', true);
      return;
    }

    // Validate number inputs
    const numberValidations = [
      { input: temperatureInput, min: 0, max: 2, name: 'Temperature' },
      { input: maxTokensInput, min: 1, name: 'Max tokens' },
      { input: topPInput, min: 0, max: 1, name: 'Top P' },
      { input: topKInput, min: 1, name: 'Top K' },
      { input: presencePenaltyInput, min: -2, max: 2, name: 'Presence penalty' },
      { input: frequencyPenaltyInput, min: -2, max: 2, name: 'Frequency penalty' },
      { input: repetitionPenaltyInput, min: 1, name: 'Repetition penalty' },
      { input: minPInput, min: 0, max: 1, name: 'Min P' }
    ];

    for (const validation of numberValidations) {
      if (!validateNumberInput(validation.input, validation.min, validation.max, validation.name)) {
        showStatus(`Invalid ${validation.name} value`, true);
        return;
      }
    }

    // Prepare settings object
    const settings = {
      apiEndpoint,
      apiKey,
      userId,
      personaId,
      model,
      systemMessage,
      stream: streamCheckbox.checked
    };

    // Add optional number parameters if they're set
    const numberInputs = {
      temperature: temperatureInput,
      maxTokens: maxTokensInput,
      topP: topPInput,
      topK: topKInput,
      presencePenalty: presencePenaltyInput,
      frequencyPenalty: frequencyPenaltyInput,
      repetitionPenalty: repetitionPenaltyInput,
      minP: minPInput
    };

    for (const [key, input] of Object.entries(numberInputs)) {
      if (input.value !== '') {
        settings[key] = parseFloat(input.value);
      }
    }

    // Save all settings
    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        showStatus('Error saving settings: ' + chrome.runtime.lastError.message, true);
      } else {
        showStatus('Settings saved successfully');
      }
    });
  });
}); 