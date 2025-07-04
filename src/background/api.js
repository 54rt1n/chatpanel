/**
 * API Client
 * 
 * Handles communication with the LLM API endpoints
 * Enhanced with better error handling and recovery mechanisms
 */

class ApiClient {
  constructor(storageManager, agentManager) {
    this.storage = storageManager;
    this.agents = agentManager;
    this.apiEndpoint = null;
    this.apiKey = null;
    this.userId = null;
    this.initialized = false;
    this.maxRetries = 3;
    this.lastAPIError = null;
    this.lastAPIErrorTime = 0;
  }
  
  /**
   * Initialize the API client
   */
  async initialize() {
    if (this.initialized) return;
    
    const settings = await this.storage.get([
      'apiKey', 
      'apiEndpoint', 
      'userId'
    ]);
    
    // Remove trailing slash if present
    this.apiEndpoint = settings.apiEndpoint ? settings.apiEndpoint.replace(/\/$/, '') : null;
    this.apiKey = settings.apiKey;
    this.userId = settings.userId || 'default_user';
    
    this.initialized = true;
    console.log('API client initialized');
  }
  
  /**
   * Ensure the client is initialized with required settings
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.apiKey) {
      throw new Error('API key not found. Please set it in the options page.');
    }
    
    if (!this.apiEndpoint) {
      throw new Error('API endpoint not configured. Please set it in the options page.');
    }
  }
  
  /**
   * Check if the backend API is available
   * @param {number} timeout - Maximum time to wait for response in ms
   * @returns {Promise<boolean>} - True if backend is available
   */
  async isBackendAvailable(timeout = 5000) {
    // If we had a recent error, avoid hammering the server
    const now = Date.now();
    if (this.lastAPIError && now - this.lastAPIErrorTime < 10000) {
      console.log('Recent backend error, skipping availability check');
      return false;
    }
    
    try {
      await this.ensureInitialized();
      
      // Create a controller to abort the request if it takes too long
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Try a lightweight HEAD request first
      const response = await fetch(this.apiEndpoint, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Backend availability check failed:', error.message);
      
      // Update error state
      this.lastAPIError = error;
      this.lastAPIErrorTime = Date.now();
      
      return false;
    }
  }
  
  /**
   * Make an API request with better error handling
   */
  async fetch(path, options = {}, retryCount = 0) {
    await this.ensureInitialized();
    
    // Ensure path starts with slash
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const url = `${this.apiEndpoint}${normalizedPath}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...(options.headers || {})  // Merge headers from options
    };
    
    const requestOptions = {
      ...options,
      headers
    };
    
    console.log(`API ${requestOptions.method || 'GET'} request to ${url}`);
    
    try {
      const response = await fetch(url, requestOptions);
      
      // Clear error state on successful response
      if (response.ok) {
        this.lastAPIError = null;
        this.lastAPIErrorTime = 0;
      }
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('API request failed:', {
            status: response.status,
            statusText: response.statusText,
            url,
            errorText
        });
        
        // For streaming requests, we don't want to retry as it complicates the stream handling
        if (options.body && options.body.includes('"stream":true')) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        // Only retry server errors and only when not streaming
        if (response.status >= 500 && retryCount < this.maxRetries) {
          console.log(`Server error (${response.status}), retrying with exponential backoff...`);
          // Calculate delay with exponential backoff (1s, 2s, 4s, 8s, etc.)
          const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.fetch(path, options, retryCount + 1);
        }
        
        // Update error state
        this.lastAPIError = new Error(`API request failed: ${response.status} ${response.statusText}`);
        this.lastAPIErrorTime = Date.now();
        
        throw this.lastAPIError;
      } 

      return response;
    } catch (error) {
      // If it's a network error and we're not streaming, we can retry
      const isNetworkError = error.name === 'TypeError' || 
                             error.message.includes('Failed to fetch') || 
                             error.message.includes('Network request failed') ||
                             error.name === 'AbortError';
      
      // Don't retry for streaming requests
      const isStreaming = options.body && options.body.includes('"stream":true');
      
      if (isNetworkError && !isStreaming && retryCount < this.maxRetries) {
        console.log(`Network error: ${error.message}, retrying with exponential backoff (${retryCount + 1}/${this.maxRetries})...`);
        
        // Calculate delay with exponential backoff (1s, 2s, 4s, 8s, etc.) plus jitter
        const baseDelay = Math.min(30000, 1000 * Math.pow(2, retryCount));
        const jitter = Math.random() * 1000; // Add up to 1s of jitter to prevent thundering herd
        const delay = baseDelay + jitter;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.fetch(path, options, retryCount + 1);
      }
      
      // Update error state
      this.lastAPIError = error;
      this.lastAPIErrorTime = Date.now();
      
      console.error('API request failed after retries:', error);
      
      // Enhance the error message for network errors
      if (isNetworkError) {
        throw new Error('Unable to reach the API server. Please check your connection and the API endpoint configuration.');
      }
      
      throw error;
    }
  }
  
  /**
   * Get LLM completion (simplified, stateless method)
   * Used by InteractionHandler for MCP agents
   */
  async getLlmCompletion(requestBody) {
    await this.ensureInitialized();
    
    console.log('Getting LLM completion:', {
      model: requestBody.model,
      messageCount: requestBody.messages?.length,
      hasTools: !!requestBody.tools && requestBody.tools.length > 0,
      stream: requestBody.stream
    });
    
    try {
      const response = await this.fetch('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      
      // For streaming responses, return the response object for stream processing
      if (requestBody.stream) {
        return response;
      }
      
      // For non-streaming responses, parse and return the JSON
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting LLM completion:', error);
      throw error;
    }
  }

  /**
   * Analyze a webpage with the active agent
   */
  async analyzeWebpage(pageData, tabId, agent) {
    console.log('Analyzing webpage:', {
      url: pageData.url,
      title: pageData.title,
      textLength: pageData.text?.length,
      agent: agent.name
    });
    
    try {
      await this.ensureInitialized();
      
      // Notify the tab to show loading state
      chrome.tabs.sendMessage(tabId, { 
        action: 'SHOW_LOADING',
        agentId: agent.id
      }).catch(err => {
        console.warn('Warning: Could not show loading state:', err.message);
        // Continue execution despite this error
      });
      
      const messages = [{
        role: 'user',
        content: `Please analyze this webpage:\nURL: ${pageData.url}\nTitle: ${pageData.title}\nContent: ${pageData.text}`,
        timestamp: Date.now()
      }];
      
      const requestBody = {
        messages,
        metadata: {
          user_id: this.userId,
          persona_id: agent.id,
          workspace_content: pageData.text,
          thought_content: null,
          conversation_id: agent.currentConversationId
        },
        model: agent.model,
        temperature: agent.temperature,
        stream: agent.stream,
        system_message: agent.systemMessage,
        max_tokens: 4096,
        top_p: undefined,
        top_k: undefined,
        presence_penalty: undefined,
        frequency_penalty: undefined,
        repetition_penalty: undefined,
        min_p: undefined
      };
      
      // Add optional parameters from agent config
      if (agent.maxTokens) requestBody.max_tokens = agent.maxTokens;
      if (agent.topP) requestBody.top_p = agent.topP;
      if (agent.topK) requestBody.top_k = agent.topK;
      if (agent.presencePenalty) requestBody.presence_penalty = agent.presencePenalty;
      if (agent.frequencyPenalty) requestBody.frequency_penalty = agent.frequencyPenalty;
      if (agent.repetitionPenalty) requestBody.repetition_penalty = agent.repetitionPenalty;
      if (agent.minP) requestBody.min_p = agent.minP;
      
      // Make the API request
      const endpoint = '/v1/chat/completions';
      const response = await this.fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      
      return { success: true, response, agent, tabId };
    } catch (error) {
      console.error('Error analyzing webpage:', error);
      
      // Format a more user-friendly error message
      let errorMessage = error.message;
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('Network request failed') ||
          error.message.includes('Unable to reach')) {
        errorMessage = 'Unable to reach the API server. Please check your connection and API configuration.';
      }
      
      // Notify the tab about the error with error handling
      try {
        chrome.tabs.sendMessage(tabId, {
          action: 'SHOW_ERROR',
          error: errorMessage,
          agentId: agent.id
        }).catch(() => {
          console.warn('Failed to send error message to tab');
        });
      } catch (e) {
        console.warn('Error sending error message to tab:', e);
      }
      
      return { success: false, error: errorMessage };
    }
  }
  
/**
 * Send a chat message or analyze a webpage
 */
async sendChatMessage(
  message, 
  url, 
  pageContent, 
  title, 
  tabId, 
  agentId, 
  conversationId, 
  streamHandler,
  conversationManager
) {
  try {
    await this.ensureInitialized();
    
    // Get the agent configuration DIRECTLY from agent manager instead of messaging
    const agent = this.agents.getAgent(agentId);
    
    if (!agent) {
      throw new Error('Agent not found or configuration error');
    }
    
    // Verify tab exists before sending messages
    try {
      await chrome.tabs.get(tabId);
    } catch (error) {
      throw new Error('Tab no longer exists or is not accessible');
    }
    
    // Notify the tab to show loading state - with enhanced error handling
    try {
      await chrome.tabs.sendMessage(tabId, { 
        action: 'SHOW_LOADING',
        agentId
      }).catch(err => {
        console.warn('Warning: Could not show loading state in tab', tabId, err.message);
        // Continue execution despite this error
      });
    } catch (error) {
      console.warn('Warning: Error showing loading state:', error);
      // Continue execution despite this error
    }
    
    // Get previous messages in this conversation
    let conversationMessages = [];
    try {
      conversationMessages = await conversationManager?.getConversationMessages(conversationId) || [];
    } catch (error) {
      console.warn('Failed to get conversation messages, starting new conversation:', error);
      // Continue with empty history
    }
    
    // If no explicit message is provided, create an analysis message
    const userMessage = message || `Please analyze this webpage:\nURL: ${url}\nTitle: ${title}\nContent: ${pageContent}`;
    
    // Add current message
    const messages = [
      ...conversationMessages,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      }
    ];
    
    const workspaceContent = "URL: " + url + "\nTitle: " + title + "\nContent: " + pageContent;
    
    const requestBody = {
      messages,
      metadata: {
        user_id: this.userId,
        persona_id: agent.name,
        workspace_content: workspaceContent,
        thought_content: null,
        conversation_id: conversationId
      },
      model: agent.model,
      temperature: agent.temperature,
      stream: agent.stream,
      system_message: agent.systemMessage,
      max_tokens: 4096
    };
    
    // Add optional parameters from agent config
    if (agent.maxTokens) requestBody.max_tokens = agent.maxTokens;
    if (agent.topP !== undefined && agent.topP !== null) requestBody.top_p = agent.topP;
    if (agent.topK !== undefined && agent.topK !== null) requestBody.top_k = agent.topK;
    if (agent.presencePenalty !== undefined && agent.presencePenalty !== null) requestBody.presence_penalty = agent.presencePenalty;
    if (agent.frequencyPenalty !== undefined && agent.frequencyPenalty !== null) requestBody.frequency_penalty = agent.frequencyPenalty;
    if (agent.repetitionPenalty !== undefined && agent.repetitionPenalty !== null) requestBody.repetition_penalty = agent.repetitionPenalty;
    if (agent.minP !== undefined && agent.minP !== null) requestBody.min_p = agent.minP;
    
    console.log('Sending chat API request to endpoint:', this.apiEndpoint, 'for', agent.name);
    
    // Make the API request with our fetch method
    const endpoint = '/v1/chat/completions';
    let response;
    
    try {
      response = await this.fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      
      console.log('Received API response:', response.status);
    } catch (error) {
      console.error('Error fetching from API:', error);
      
      // Notify the tab about the error 
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'SHOW_ERROR',
          error: error.message,
          agentId
        }).catch(() => console.warn('Could not show error in tab'));
      } catch (e) {
        console.warn('Error sending error message to tab:', e);
      }
      
      // Hide loading indicator
      try {
        await chrome.tabs.sendMessage(tabId, { 
          action: 'HIDE_LOADING',
          agentId
        }).catch(() => console.warn('Could not hide loading in tab'));
      } catch (e) {
        console.warn('Error hiding loading indicator:', e);
      }
      
      return { success: false, error: error.message };
    }
    
    // Handle streaming or non-streaming response
    let fullResponse = '';
    
    if (agent.stream && streamHandler) {
      // Process streaming response
      const streamReader = response.body.getReader();
      streamHandler.registerStream(agentId, streamReader, tabId);
      
      try {
        fullResponse = await streamHandler.processStream(agentId);
      } catch (error) {
        // If there was a network error during streaming, we've already handled it
        // in the stream handler, so just log it here and continue
        console.error('Error during stream processing:', error);
        
        // Create an error message if we don't have any content yet
        if (!fullResponse) {
          fullResponse = `Error processing response: ${error.message}\n\nPlease try again.`;
          
          // Try to send the error to the tab
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'STREAM_CONTENT',
              content: fullResponse,
              isFirst: true,
              agentId
            }).catch(() => console.warn('Could not send error content to tab'));
          } catch (e) {
            console.warn('Error sending error message to tab:', e);
          }
        }
      }
    } else {
      // Process regular response
      try {
        const data = await response.json();
        fullResponse = data.choices[0].message.content;
      } catch (error) {
        console.error('Error parsing API response:', error);
        fullResponse = `Error parsing API response: ${error.message}\n\nPlease try again later.`;
      }
      
      // Send with error handling
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'STREAM_CONTENT',
          content: fullResponse,
          isFirst: true,
          agentId
        }).catch(err => {
          console.warn('Warning: Could not send content to tab', tabId, err.message);
        });
        
        await chrome.tabs.sendMessage(tabId, { 
          action: 'HIDE_LOADING',
          agentId
        }).catch(err => {
          console.warn('Warning: Could not hide loading in tab', tabId, err.message);
        });
      } catch (error) {
        console.warn('Warning: Error sending message to tab:', error);
        // Continue execution despite this error
      }
    }
    
    // Store the message and response if we have a conversation manager
    if (conversationManager && fullResponse) {
      try {
        await conversationManager.storeMessage(
          userMessage, 
          fullResponse, 
          url, 
          title, 
          conversationId, 
          agentId,
          agent.model
        );
      } catch (error) {
        console.error('Error storing message:', error);
        // Don't throw - this is not critical to the user experience
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error sending chat message:', error);
    
    // Format a more user-friendly error message
    let errorMessage = error.message;
    if (error.message.includes('Failed to fetch') || 
        error.message.includes('Network request failed') ||
        error.message.includes('Unable to reach')) {
      errorMessage = 'Unable to reach the API server. Please check your connection and API configuration.';
    }
    
    // Notify the tab about the error
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_ERROR',
        error: errorMessage,
        agentId
      }).catch(() => console.warn('Could not show error in tab'));
    } catch (e) {
      console.warn('Error sending error message to tab:', e);
    }
    
    return { success: false, error: errorMessage };
  }
}

  /**
   * Save a conversation to an external API
   */
  async saveConversation(conversationId, messages) {
    console.log('Saving conversation:', conversationId);
    
    try {
      await this.ensureInitialized();
      
      // Check for recent errors before attempting the save
      if (this.lastAPIError && Date.now() - this.lastAPIErrorTime < 30000) {
        throw new Error('Recent API error detected. Please try again later.');
      }
      
      const response = await this.fetch('/api/conversation', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId,
          messages,
        }),
      });
      
      return await response.json();
    } catch (error) {
      console.error('Save conversation error:', error);
      
      // Enhance error message for user visibility
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('Network request failed') ||
          error.message.includes('Unable to reach')) {
        throw new Error('Unable to save conversation. The API server is currently unreachable.');
      }
      
      throw error;
    }
  }
}

export default ApiClient;