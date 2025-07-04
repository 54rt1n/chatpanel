/**
 * Interaction Handler
 * 
 * Orchestrates complex multi-step interactions between LLM and MCP tools.
 * This component manages the stateful conversation loop where the LLM can
 * call tools provided by an MCP server and use their results.
 */

class InteractionHandler {
  constructor(dependencies) {
    const {
      agent,
      initialMessage,
      conversationId,
      apiClient,
      mcpConnector,
      streamHandler,
      conversationManager,
      tabId,
      url,
      pageContent,
      title
    } = dependencies;

    this.agent = agent;
    this.initialMessage = initialMessage;
    this.conversationId = conversationId;
    this.apiClient = apiClient;
    this.mcpConnector = mcpConnector;
    this.streamHandler = streamHandler;
    this.conversationManager = conversationManager;
    this.tabId = tabId;
    this.url = url;
    this.pageContent = pageContent;
    this.title = title;

    // Configuration
    this.maxIterations = 5; // Prevent infinite loops
    this.currentIteration = 0;
    this.messageHistory = [];
    this.tools = [];
  }

  /**
   * Main orchestration method
   * Manages the entire interaction from start to finish
   */
  async run() {
    try {
      console.log(`Starting MCP interaction for agent ${this.agent.name}`);

      // Step 1: Initialize MCP connection and get tools
      await this.initializeMCP();

      // Step 2: Build initial message history
      await this.buildMessageHistory();

      // Step 3: Start the interaction loop
      const finalResponse = await this.interactionLoop();

      // Step 4: Store the conversation
      await this.storeConversation(finalResponse);

      console.log('MCP interaction completed successfully');
      return { success: true };

    } catch (error) {
      console.error('Error in MCP interaction:', error);
      
      // Send error to UI
      this.streamHandler.broadcastToAgentTabs(this.agent.id, {
        action: 'SHOW_ERROR',
        error: error.message,
        agentId: this.agent.id
      });

      return { success: false, error: error.message };
    } finally {
      // Always hide loading indicator
      this.streamHandler.broadcastToAgentTabs(this.agent.id, {
        action: 'HIDE_LOADING',
        agentId: this.agent.id
      });
    }
  }

  /**
   * Initialize MCP connection and fetch available tools
   */
  async initializeMCP() {
    try {
      console.log('Initializing MCP connector...');
      this.tools = await this.mcpConnector.initialize();
      console.log(`MCP initialized with ${this.tools.length} tools:`, this.tools.map(t => t.function.name));
    } catch (error) {
      throw new Error(`Failed to initialize MCP connection: ${error.message}`);
    }
  }

  /**
   * Build the initial message history including previous conversation
   */
  async buildMessageHistory() {
    try {
      // Get previous messages in this conversation
      const previousMessages = await this.conversationManager.getConversationMessages(this.conversationId) || [];
      
      // Create the new user message
      const userMessage = this.initialMessage || 
        `Please analyze this webpage:\nURL: ${this.url}\nTitle: ${this.title}\nContent: ${this.pageContent}`;

      // Build complete message history
      this.messageHistory = [
        ...previousMessages,
        {
          role: 'user',
          content: userMessage,
          timestamp: Date.now()
        }
      ];

      console.log(`Built message history with ${this.messageHistory.length} messages`);
    } catch (error) {
      console.warn('Failed to get conversation history, starting fresh:', error);
      
      // Fallback to just the current message
      const userMessage = this.initialMessage || 
        `Please analyze this webpage:\nURL: ${this.url}\nTitle: ${this.title}\nContent: ${this.pageContent}`;

      this.messageHistory = [{
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      }];
    }
  }

  /**
   * Main interaction loop - handles LLM ↔ Tools conversation
   */
  async interactionLoop() {
    let finalResponse = '';

    while (this.currentIteration < this.maxIterations) {
      this.currentIteration++;
      console.log(`Interaction iteration ${this.currentIteration}/${this.maxIterations}`);

      try {
        // Call LLM with current message history and available tools
        const llmResponse = await this.callLLM();

        // Check if the response contains tool calls
        if (this.hasToolCalls(llmResponse)) {
          // Execute tools and add results to message history
          await this.executeToolCalls(llmResponse);
          
          // Continue the loop to get the final response
          continue;
        } else {
          // This is the final text response
          finalResponse = this.extractTextContent(llmResponse);
          
          // Stream the response to UI
          await this.streamResponseToUI(finalResponse);
          
          // Exit the loop
          break;
        }
      } catch (error) {
        console.error(`Error in iteration ${this.currentIteration}:`, error);
        
        // On error, try to provide a helpful response
        finalResponse = `I encountered an error while processing your request: ${error.message}\n\nPlease try again or contact support if the issue persists.`;
        
        // Stream error response to UI
        await this.streamResponseToUI(finalResponse);
        break;
      }
    }

    // Check for max iterations reached
    if (this.currentIteration >= this.maxIterations && !finalResponse) {
      finalResponse = `I've reached the maximum number of tool interactions (${this.maxIterations}). The conversation may be too complex for a single response. Please try breaking your request into smaller parts.`;
      await this.streamResponseToUI(finalResponse);
    }

    return finalResponse;
  }

  /**
   * Call the LLM with the current message history and tools
   */
  async callLLM() {
    console.log('Calling LLM with tools...');
    
    // Prepare the request - filter out tool-specific fields for the LLM
    const messages = this.messageHistory.map(msg => {
      const cleanMsg = {
        role: msg.role,
        content: msg.content
      };
      
      // Include tool calls if present
      if (msg.tool_calls) {
        cleanMsg.tool_calls = msg.tool_calls;
      }
      
      // Include tool call ID for tool messages
      if (msg.tool_call_id) {
        cleanMsg.tool_call_id = msg.tool_call_id;
      }
      
      return cleanMsg;
    });

    // Add workspace content to metadata if this is analysis
    const workspaceContent = `URL: ${this.url}\nTitle: ${this.title}\nContent: ${this.pageContent}`;

    const requestBody = {
      messages,
      metadata: {
        user_id: 'default_user', // TODO: Get from actual user settings
        persona_id: this.agent.name,
        workspace_content: workspaceContent,
        thought_content: null,
        conversation_id: this.conversationId
      },
      model: this.agent.model,
      temperature: this.agent.temperature,
      stream: false, // For now, disable streaming in MCP mode to simplify tool handling
      system_message: this.agent.systemMessage,
      max_tokens: this.agent.maxTokens || 4096,
      tools: this.tools // Include available tools
    };

    // Add optional parameters
    if (this.agent.topP !== undefined && this.agent.topP !== null) requestBody.top_p = this.agent.topP;
    if (this.agent.topK !== undefined && this.agent.topK !== null) requestBody.top_k = this.agent.topK;
    if (this.agent.presencePenalty !== undefined && this.agent.presencePenalty !== null) requestBody.presence_penalty = this.agent.presencePenalty;
    if (this.agent.frequencyPenalty !== undefined && this.agent.frequencyPenalty !== null) requestBody.frequency_penalty = this.agent.frequencyPenalty;
    if (this.agent.repetitionPenalty !== undefined && this.agent.repetitionPenalty !== null) requestBody.repetition_penalty = this.agent.repetitionPenalty;
    if (this.agent.minP !== undefined && this.agent.minP !== null) requestBody.min_p = this.agent.minP;

    // Use the simplified API client
    const response = await this.apiClient.getLlmCompletion(requestBody);
    
    console.log('Received LLM response');
    return response;
  }

  /**
   * Check if the LLM response contains tool calls
   */
  hasToolCalls(response) {
    try {
      // For streaming responses, we need to parse the final result
      if (response && response.choices && response.choices[0]) {
        const message = response.choices[0].message || response.choices[0].delta;
        return message && message.tool_calls && message.tool_calls.length > 0;
      }
      return false;
    } catch (error) {
      console.warn('Error checking for tool calls:', error);
      return false;
    }
  }

  /**
   * Execute tool calls from the LLM response
   */
  async executeToolCalls(response) {
    try {
      const message = response.choices[0].message || response.choices[0].delta;
      const toolCalls = message.tool_calls || [];

      console.log(`Executing ${toolCalls.length} tool calls`);

      // Add the assistant's message with tool calls to history
      this.messageHistory.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: toolCalls,
        timestamp: Date.now()
      });

      // Execute each tool call
      for (const toolCall of toolCalls) {
        try {
          console.log(`Executing tool: ${toolCall.function.name}`);
          
          // Parse tool arguments
          const args = typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

          // Execute the tool via MCP
          const toolResult = await this.mcpConnector.executeTool(
            toolCall.function.name,
            args
          );

          // Add tool result to message history
          this.messageHistory.push({
            role: 'tool',
            content: toolResult.content,
            tool_call_id: toolCall.id,
            timestamp: Date.now()
          });

          console.log(`Tool ${toolCall.function.name} executed successfully`);
        } catch (toolError) {
          console.error(`Error executing tool ${toolCall.function.name}:`, toolError);
          
          // Add error result to message history
          this.messageHistory.push({
            role: 'tool',
            content: `Error executing tool: ${toolError.message}`,
            tool_call_id: toolCall.id,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Error executing tool calls:', error);
      throw error;
    }
  }

  /**
   * Extract text content from LLM response
   */
  extractTextContent(response) {
    try {
      if (response && response.choices && response.choices[0]) {
        const message = response.choices[0].message || response.choices[0].delta;
        return message?.content || '';
      }
      return '';
    } catch (error) {
      console.warn('Error extracting text content:', error);
      return '';
    }
  }

  /**
   * Stream response to UI
   */
  async streamResponseToUI(content) {
    if (!content) return;

    try {
      // Send content to UI
      this.streamHandler.broadcastToAgentTabs(this.agent.id, {
        action: 'STREAM_CONTENT',
        content: content,
        isFirst: true,
        agentId: this.agent.id
      });

      console.log('Response streamed to UI');
    } catch (error) {
      console.error('Error streaming to UI:', error);
    }
  }

  /**
   * Store the final conversation
   */
  async storeConversation(finalResponse) {
    if (!finalResponse || !this.conversationManager) return;

    try {
      const userMessage = this.initialMessage || `Analyzed webpage: ${this.url}`;
      
      await this.conversationManager.storeMessage(
        userMessage,
        finalResponse,
        this.url,
        this.title,
        this.conversationId,
        this.agent.id,
        this.agent.model
      );

      console.log('Conversation stored successfully');
    } catch (error) {
      console.error('Error storing conversation:', error);
      // Don't throw - this is not critical to user experience
    }
  }
}

export default InteractionHandler; 