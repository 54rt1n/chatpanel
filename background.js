console.log('Background script loaded and running');

// Default values
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const DEFAULT_USER_ID = 'default_user';
const DEFAULT_PERSONA_ID = 'default_persona';
const DEFAULT_SYSTEM_MESSAGE = 'You are a helpful assistant that analyzes webpage content.';

// Helper function to get settings from storage
async function getSettings() {
  console.log('Fetching settings from storage');
  const result = await chrome.storage.local.get([
    'apiKey',
    'apiEndpoint',
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
  ]);

  console.log('Settings retrieved:', {
    ...result,
    apiKey: result.apiKey ? '[HIDDEN]' : undefined
  });

  return {
    apiKey: result.apiKey,
    apiEndpoint: result.apiEndpoint || 'http://localhost:8000/v1/chat/completions',
    userId: result.userId || DEFAULT_USER_ID,
    personaId: result.personaId || DEFAULT_PERSONA_ID,
    model: result.model || DEFAULT_MODEL,
    systemMessage: result.systemMessage || DEFAULT_SYSTEM_MESSAGE,
    temperature: result.temperature !== undefined ? result.temperature : 0.7,
    maxTokens: result.maxTokens,
    topP: result.topP,
    topK: result.topK,
    presencePenalty: result.presencePenalty,
    frequencyPenalty: result.frequencyPenalty,
    repetitionPenalty: result.repetitionPenalty,
    minP: result.minP,
    stream: result.stream !== undefined ? result.stream : true
  };
}

// Function to process streaming response
async function processStream(reader, tabId) {
  let isFirst = true;
  const decoder = new TextDecoder();
  console.log('Starting to process stream for tab:', tabId);
  
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log('Stream complete');
        break;
      }
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.includes('[DONE]')) continue;
        
        try {
          const jsonStr = line.replace(/^data: /, '');
          const data = JSON.parse(jsonStr);
          
          const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
          if (!content) continue;
          
          console.log('Sending content chunk to tab:', tabId);
          chrome.tabs.sendMessage(tabId, {
            action: 'STREAM_CONTENT',
            content,
            isFirst
          });
          isFirst = false;
        } catch (e) {
          console.error('Error parsing streaming data:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error processing stream:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_ERROR',
      error: 'Error processing response stream'
    });
  } finally {
    console.log('Stream processing complete, hiding loading indicator');
    chrome.tabs.sendMessage(tabId, { action: 'HIDE_LOADING' });
  }
}

// Function to call the AI endpoint
async function callAIEndpoint(pageData, tabId) {
  console.log('Calling AI endpoint with data:', {
    url: pageData.url,
    title: pageData.title,
    textLength: pageData.text?.length
  });

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('API key not found. Please set it in the options page.');
    }
    if (!settings.apiEndpoint) {
      throw new Error('API endpoint not configured. Please set it in the options page.');
    }

    console.log('Showing loading indicator');
    chrome.tabs.sendMessage(tabId, { action: 'SHOW_LOADING' });

    const messages = [{
      role: 'user',
      content: `Please analyze this webpage:\nURL: ${pageData.url}\nTitle: ${pageData.title}\nContent: ${pageData.text}`,
      timestamp: Date.now()
    }];

    const requestBody = {
      messages,
      metadata: {
        user_id: settings.userId,
        persona_id: settings.personaId,
        workspace_content: pageData.text,
        thought_content: null
      },
      model: settings.model,
      temperature: settings.temperature,
      stream: settings.stream,
      system_message: settings.systemMessage
    };

    // Add optional parameters
    if (settings.maxTokens) requestBody.max_tokens = settings.maxTokens;
    if (settings.topP) requestBody.top_p = settings.topP;
    if (settings.topK) requestBody.top_k = settings.topK;
    if (settings.presencePenalty) requestBody.presence_penalty = settings.presencePenalty;
    if (settings.frequencyPenalty) requestBody.frequency_penalty = settings.frequencyPenalty;
    if (settings.repetitionPenalty) requestBody.repetition_penalty = settings.repetitionPenalty;
    if (settings.minP) requestBody.min_p = settings.minP;

    console.log('Making API request to:', settings.apiEndpoint);
    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error('API request failed:', response.status, response.statusText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    console.log('API request successful');
    if (settings.stream) {
      console.log('Processing streaming response');
      const reader = response.body.getReader();
      await processStream(reader, tabId);
    } else {
      console.log('Processing non-streaming response');
      const data = await response.json();
      chrome.tabs.sendMessage(tabId, {
        action: 'STREAM_CONTENT',
        content: data.choices[0].message.content,
        isFirst: true
      });
      chrome.tabs.sendMessage(tabId, { action: 'HIDE_LOADING' });
    }

    return { success: true };
  } catch (error) {
    console.error('Error calling AI endpoint:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'SHOW_ERROR',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  if (request.action === 'ANALYZE_PAGE') {
    console.log('Starting page analysis');
    // Use the explicitly passed tabId from the popup, or fall back to sender.tab.id for content script messages
    const tabId = request.tabId || (sender.tab && sender.tab.id);
    if (!tabId) {
      console.error('No tab ID available for analysis');
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }
    
    callAIEndpoint(request.data, tabId)
      .then(response => {
        console.log('Analysis complete:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Error in message handler:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
}); 