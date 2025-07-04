/**
 * MCP Connector Module
 * Lightweight module to connect to MCP SSE endpoints and manage tool execution
 * 
 * This implementation is modeled after the official @modelcontextprotocol/sdk
 * and best practices for handling Server-Sent Events in a browser environment.
 */

class MCPConnector {
    constructor(mcpServerUrl) {
      this.mcpServerUrl = mcpServerUrl;
      this.sessionId = randomUUID(); // Generate a unique session ID for this connection
      this.eventSource = null;
      this.postEndpoint = null;
      this.tools = [];
      this.pendingRequests = new Map();
      this.requestId = 0;
      this.isConnected = false;
      this.isInitialized = false;
      this.connectionTimeout = null;
      this.onOpenBound = this.handleOpen.bind(this);
      this.onMessageBound = this.handleMessage.bind(this);
      this.onErrorBound = this.handleError.bind(this);
      this.onEndpointBound = this.handleEndpoint.bind(this);
    }
  
    /**
     * Initialize connection to MCP server
     */
    async initialize() {
      if (this.isInitialized) return this.tools;
  
      try {
        console.log('Initializing MCP Connector...');
        
        // Connect to SSE endpoint
        await this.connectSSE();
        
        // Perform MCP handshake
        await this.performHandshake();
        
        // Get available tools
        this.tools = await this.fetchTools();
        
        this.isInitialized = true;
        console.log(`MCP Connector initialized with ${this.tools.length} tools`);
        
        return this.tools;
      } catch (error) {
        console.error('Failed to initialize MCP connector:', error);
        throw error;
      }
    }
  
    /**
     * Connect to SSE endpoint
     */
    async connectSSE() {
      return new Promise((resolve, reject) => {
        this.resolveConnection = resolve;
        this.rejectConnection = reject;

        this.eventSource = this.createEventSource();
        
        // Set timeout for connection
        this.connectionTimeout = setTimeout(() => {
          this.connectionTimeout = null;
          reject(new Error('SSE connection timeout'));
        }, 10000);
  
        // Use bound listeners for proper cleanup
        this.eventSource.onopen = this.onOpenBound;
        this.eventSource.onmessage = this.onMessageBound;
        this.eventSource.onerror = this.onErrorBound;
        
        // Listen for the 'endpoint' event to get the POST URL
        this.eventSource.addEventListener('endpoint', this.onEndpointBound);
      });
    }
  
    /**
     * Create the EventSource with the correct URL, including session_id
     */
    createEventSource() {
      const sseUrl = new URL(this.mcpServerUrl);
      sseUrl.searchParams.append('session_id', this.sessionId);
      console.log(`Connecting to SSE endpoint: ${sseUrl}`);
      return new EventSource(sseUrl);
    }
    
    /**
     * Handle connection opening
     */
    handleOpen() {
      console.log('SSE connection established');
      this.isConnected = true;
    }
    
    /**
     * Handle incoming SSE messages (for responses to requests)
     */
    handleMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.id && this.pendingRequests.has(data.id)) {
          const { resolve } = this.pendingRequests.get(data.id);
          this.pendingRequests.delete(data.id);
          resolve(data);
        }
      } catch (error) {
        console.warn('Error parsing SSE message:', error);
      }
    }
    
    /**
     * Handle SSE errors
     */
    handleError(error) {
      console.error('SSE error:', error);
      this.isConnected = false;

      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      if (!this.isInitialized && this.rejectConnection) {
        this.rejectConnection(error);
      }
      // Clean up promise handlers
      this.resolveConnection = null;
      this.rejectConnection = null;
    }

    /**
     * Handle the 'endpoint' event from the server
     */
    handleEndpoint(event) {
      console.log('Received "endpoint" event with data:', event.data);

      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      try {
        let endpointPath;
        try {
          const sessionData = JSON.parse(event.data);
          endpointPath = sessionData.postEndpoint;
        } catch (e) {
          console.warn('Could not parse endpoint data as JSON, treating as a raw path.');
          if (typeof event.data === 'string') {
            endpointPath = event.data;
          }
        }

        if (endpointPath) {
          const serverOrigin = new URL(this.mcpServerUrl).origin;
          this.postEndpoint = new URL(endpointPath, serverOrigin).href;
        } else {
          this.postEndpoint = this.mcpServerUrl.replace('/sse', '/message');
          console.warn(`Could not determine postEndpoint from data. Using fallback: ${this.postEndpoint}`);
        }

        console.log(`MCP session established. POST endpoint: ${this.postEndpoint}`);
        if (this.resolveConnection) {
          this.resolveConnection();
        }
      } catch (error) {
        console.error('Error handling endpoint event:', error);
        if (this.rejectConnection) {
          this.rejectConnection(error);
        }
      } finally {
        // Clean up promise handlers
        this.resolveConnection = null;
        this.rejectConnection = null;
      }
    }
  
    /**
     * Perform MCP protocol handshake
     */
    async performHandshake() {
      // Initialize
      const initResponse = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'chatpanel-mcp', version: '1.0.0' }
        }
      });
  
      if (initResponse.error) {
        throw new Error(`MCP init failed: ${initResponse.error.message}`);
      }
  
      // Send initialized notification
      await this.sendRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
    }
  
    /**
     * Fetch available tools from MCP server
     */
    async fetchTools() {
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'tools/list'
      });
  
      if (response.error) {
        throw new Error(`Failed to list tools: ${response.error.message}`);
      }
  
      // Convert MCP tools to OpenAI tools format
      const tools = (response.result?.tools || []).map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {}
        }
      }));
  
      return tools;
    }
  
    /**
     * Execute a tool call
     */
    async executeTool(toolName, parameters = {}) {
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      });
  
      if (response.error) {
        throw new Error(`Tool execution failed: ${response.error.message}`);
      }
  
      // Return in OpenAI tool call result format
      return {
        content: JSON.stringify(response.result?.content || response.result)
      };
    }
  
    /**
     * Send request to MCP server
     */
    async sendRequest(request) {
      if (!this.postEndpoint) {
        throw new Error('MCP server not connected');
      }
  
      return new Promise((resolve, reject) => {
        const requestId = request.id;
        
        // Store pending request if it has an ID
        if (requestId) {
          this.pendingRequests.set(requestId, { resolve, reject });
          
          // Timeout after 30 seconds
          setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
              this.pendingRequests.delete(requestId);
              reject(new Error('Request timeout'));
            }
          }, 30000);
        }
  
        // Send request
        fetch(this.postEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        }).then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // For notifications (no ID), resolve immediately
          if (!requestId) {
            resolve({ success: true });
          }
        }).catch(error => {
          if (requestId && this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
          }
          if (!requestId) {
            reject(error);
          }
        });
      });
    }
  
    /**
     * Get available tools in OpenAI format
     */
    getTools() {
      return this.tools;
    }
  
    /**
     * Get next request ID
     */
    getNextId() {
      return ++this.requestId;
    }
  
    /**
     * Disconnect and clean up all resources
     */
    disconnect() {
      if (this.eventSource) {
        // Remove all listeners before closing to prevent memory leaks and race conditions
        this.eventSource.removeEventListener('endpoint', this.onEndpointBound);
        this.eventSource.onopen = null;
        this.eventSource.onmessage = null;
        this.eventSource.onerror = null;
        
        // Close the connection
        this.eventSource.close();
        this.eventSource = null;
        console.log('MCP connection closed and listeners removed.');
      }
      this.isConnected = false;
      this.isInitialized = false;
      this.tools = [];
      this.pendingRequests.clear();
    }
  }
  
  export default MCPConnector;
  
  // Helper to generate a random UUID for session IDs
  function randomUUID() {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }