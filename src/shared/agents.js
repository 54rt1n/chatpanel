/**
 * Agent Manager
 * 
 * Manages creation, updating, and persistence of agent configurations
 */

class AgentManager {
  constructor(storageManager) {
    this.storage = storageManager;
    this.agents = [];
    this.activeAgentId = null;
    this.initialized = false;
  }

  /**
   * Initialize the agent manager from storage
   */
  async initialize() {
    if (this.initialized) return;
    
    // Load agents from storage or create default
    const data = await this.storage.get({
      'agents': [],
      'activeAgentId': null
    });
    
    this.agents = data.agents.length > 0 ? data.agents : [this.createDefaultAgent()];
    this.activeAgentId = data.activeAgentId || this.agents[0].id;
    
    await this.saveAgents();
    this.initialized = true;
    
    console.log('AgentManager initialized with', this.agents.length, 'agents');
    return this.getActiveAgent();
  }

  /**
   * Create a default agent with sensible defaults
   */
  createDefaultAgent() {
    return {
      id: 'agent_' + Date.now(),
      name: 'AI Assistant',
      systemMessage: 'You are a helpful assistant that analyzes webpage content.',
      model: 'gpt-3.5-turbo',
      currentConversationId: this.generateConversationId(),
      temperature: 0.7,
      maxTokens: null,
      topP: null,
      topK: null,
      presencePenalty: null,
      frequencyPenalty: null,
      repetitionPenalty: null,
      minP: null,
      stream: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * Generate a unique conversation ID
   */
  generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Save agents to storage
   */
  async saveAgents() {
    await this.storage.set({
      agents: this.agents,
      activeAgentId: this.activeAgentId
    });
    console.log('Saved', this.agents.length, 'agents to storage');
  }

  /**
   * Get the active agent
   */
  getActiveAgent() {
    return this.agents.find(a => a.id === this.activeAgentId) || this.agents[0];
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId) {
    return this.agents.find(a => a.id === agentId);
  }

  /**
   * Set the active agent
   */
  async setActiveAgent(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;
    
    this.activeAgentId = agentId;
    await this.saveAgents();
    return agent;
  }

  /**
   * Add a new agent
   */
  async addAgent(config) {
    const newAgent = {
      id: 'agent_' + Date.now(),
      currentConversationId: this.generateConversationId(),
      temperature: 0.7,
      stream: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...config
    };
    
    this.agents.push(newAgent);
    await this.saveAgents();
    return newAgent;
  }

  /**
   * Update an agent's configuration
   */
  async updateAgent(agentId, updates) {
    const index = this.agents.findIndex(a => a.id === agentId);
    if (index === -1) return null;
    
    this.agents[index] = { 
      ...this.agents[index], 
      ...updates, 
      updatedAt: Date.now() 
    };
    
    await this.saveAgents();
    return this.agents[index];
  }

  /**
   * Remove an agent by ID
   */
  async removeAgent(agentId) {
    const previousLength = this.agents.length;
    this.agents = this.agents.filter(a => a.id !== agentId);
    
    // Don't allow removing all agents
    if (this.agents.length === 0) {
      this.agents.push(this.createDefaultAgent());
    }
    
    // Update active agent if we removed the active one
    if (this.activeAgentId === agentId) {
      this.activeAgentId = this.agents[0].id;
    }
    
    await this.saveAgents();
    return previousLength !== this.agents.length;
  }

  /**
   * Start a new conversation for an agent
   */
  async startNewConversation(agentId) {
    const agent = this.getAgent(agentId || this.activeAgentId);
    if (!agent) return null;
    
    const oldConversationId = agent.currentConversationId;
    agent.currentConversationId = this.generateConversationId();
    await this.saveAgents();
    
    return {
      agent,
      oldConversationId,
      newConversationId: agent.currentConversationId
    };
  }
  
  /**
   * Get all agents
   */
  getAllAgents() {
    return [...this.agents];
  }
}

export default AgentManager;