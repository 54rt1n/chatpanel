/**
 * API Client
 * 
 * Handles communication with the LLM API endpoints
 */

class ApiClient {
  constructor(storageManager, agentManager) {
    this.storage = storageManager;
    this.agents = agentManager;
    this.apiEndpoint = null;
    this.apiKey = null;
    this.userId = null;
    this.initialized = false;
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
   * Make an API request
   */
  async fetch(path, options = {}) {
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
      
     if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('API request failed:', {
            status: response.status,
            statusText: response.statusText,
            url,
            requestOptions,
            errorText
        });
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      } 

      return response;
    } catch (error) {
      console.error('API request failed:', error);
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
      
      // Notify the tab about the error
      chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_ERROR',
        error: error.message,
        agentId: agent.id
      });
      
      return { success: false, error: error.message };
    }
  }
  
/**
 * Send a chat message
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
    
    // Notify the tab to show loading state - with error handling
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
    const conversationMessages = await conversationManager.getConversationMessages(conversationId);
    
    // Add current message
    const messages = [
      ...conversationMessages,
      {
        role: 'user',
        content: message,
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
      model: agent.model,  // Direct property access instead of agent.data.model
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
    
    console.log('Sending chat API request to endpoint:', this.apiEndpoint, 'for', agent.name);
    
    // Make the API request
    const endpoint = '/v1/chat/completions';
    const response = await this.fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
    
    console.log('Received API response:', response.status);
    
    // Handle streaming or non-streaming response
    let fullResponse = '';
    
    if (agent.stream) {
      // Process streaming response
      const streamReader = response.body.getReader();
      streamHandler.registerStream(agentId, streamReader, tabId);
      
      try {
        fullResponse = await streamHandler.processStream(agentId);
      } catch (error) {
        console.error('Error processing stream:', error);
        throw error;
      }
    } else {
      // Process regular response
      const data = await response.json();
      fullResponse = data.choices[0].message.content;
      
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
    
    // Store the message and response
    await conversationManager.storeMessage(
      message, 
      fullResponse, 
      url, 
      title, 
      conversationId, 
      agentId
    );
    
    return { success: true };
  } catch (error) {
    console.error('Error sending chat message:', error);
    
    // Notify the tab about the error - with error handling
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_ERROR',
        error: error.message,
        agentId
      }).catch(() => {
        // Silent catch - we're already in an error state
      });
    } catch (e) {
      // Silent catch - we're already in an error state
    }
    
    return { success: false, error: error.message };
  }
}

  /**
   * Save a conversation to an external API
   */
  async saveConversation(conversationId, messages) {
    console.log('Saving conversation:', conversationId);
    
    try {
      await this.ensureInitialized();
      
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
      throw error;
    }
  }
}

export default ApiClient;