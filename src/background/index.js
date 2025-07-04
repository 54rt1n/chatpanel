/**
 * Background Script Entry Point
 * 
 * This is the main entry point for the service worker.
 * It imports all needed modules and initializes the extension.
 * Enhanced with better error handling and recovery mechanisms.
 */

import StorageManager from '../shared/storage';
import AgentManager from '../shared/agents';
import ConversationManager from '../shared/conversations';
import MessageRouter from './message-router';
import StreamHandler from './stream-handler';
import ApiClient from './api';
import ErrorLogger from '../shared/error-logger';
import MCPConnector from './mcp-connector';
import InteractionHandler from './interaction-handler';

console.log('Background script loaded and running');

// Main application class
class BackgroundApp {
    constructor() {
      // Initialize managers
      this.storage = new StorageManager();
      this.errorLogger = new ErrorLogger(this.storage);
      this.agents = new AgentManager(this.storage);
      this.api = new ApiClient(this.storage, this.agents);  // Initialize API client first
      this.conversations = new ConversationManager(this.storage, this.api); // Pass API client
      this.streamHandler = new StreamHandler(this.agents);
      
      // Initialize MCP connectors map (keyed by mcpServerUrl)
      this.mcpConnectors = new Map();
      
      // Initialize message router
      this.messageRouter = new MessageRouter(
        this.agents,
        this.conversations,
        this.api,
        this.streamHandler,
        this.errorLogger,
        this.mcpConnectors,
        InteractionHandler,
        this.getOrCreateMCPConnector.bind(this)
      );
      
      // State tracking
      this.activePanelTabs = new Set();
      this.startTime = Date.now();
      this.initializationComplete = false;

      // Set up global error handler
      this.setupGlobalErrorHandler();
    }
  
  async initialize() {
    try {
      console.log('Initializing background application...');
      
      // Initialize error logger first to catch initialization errors
      await this.errorLogger.initialize();
      
      // Initialize all other managers
      await this.storage.initialize();
      await this.agents.initialize();
      await this.conversations.initialize();
      await this.api.initialize();
      
      // Set up message listeners
      this.setupMessageListeners();
      
      // Set up context menus
      this.setupContextMenus();
      
      // Set up tab event listeners
      this.setupTabListeners();
      
      // Set up recovery mechanism
      this.setupRecoveryMechanism();
      
      // Set up MCP connector cleanup
      this.setupMCPCleanup();
      
      console.log('Background application initialized successfully');
      this.initializationComplete = true;
      
      // Log successful initialization
      this.errorLogger.logError(
        'Service worker started successfully', 
        'Initialization', 
        {
          startupTime: Date.now() - this.startTime,
          activeTabs: this.activePanelTabs.size
        },
        'info'
      );
      
      // Verify API connectivity on startup
      this.checkApiConnectivity();
    } catch (error) {
      console.error('Error initializing background app:', error);
      
      // Log initialization error
      this.errorLogger.logError(
        error,
        'Initialization',
        {
          startupTime: Date.now() - this.startTime,
          stack: error.stack
        },
        this.errorLogger.errorTypes.EXTENSION_ERROR
      );
    }
  }
  
  /**
   * Set up global error handler
   */
  setupGlobalErrorHandler() {
    self.addEventListener('error', (event) => {
      this.errorLogger.logError(
        event.error || event.message,
        'Global Error Handler',
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        },
        this.errorLogger.errorTypes.EXTENSION_ERROR
      );
    });
    
    self.addEventListener('unhandledrejection', (event) => {
      this.errorLogger.logError(
        event.reason || 'Unhandled Promise Rejection',
        'Global Rejection Handler',
        {
          message: event.reason?.message,
          stack: event.reason?.stack
        },
        this.errorLogger.errorTypes.EXTENSION_ERROR
      );
    });
  }
  
  /**
   * Check API connectivity on startup
   */
  async checkApiConnectivity() {
    try {
      const isAvailable = await this.api.isBackendAvailable(10000);
      if (!isAvailable) {
        console.warn('API server is not reachable on startup');
        this.errorLogger.logError(
          'API server unreachable on startup',
          'API Connectivity Check',
          { endpoint: this.api.apiEndpoint },
          this.errorLogger.errorTypes.API_ERROR
        );
      } else {
        console.log('API connectivity verified successfully');
      }
    } catch (error) {
      console.error('Error checking API connectivity:', error);
      this.errorLogger.logError(
        error,
        'API Connectivity Check',
        { endpoint: this.api.apiEndpoint },
        this.errorLogger.errorTypes.API_ERROR
      );
    }
  }
  
  setupMessageListeners() {
    // Listen for messages from content scripts, popup, etc.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Quick response for ping messages to avoid message routing overhead
      if (message && message.action === 'PING') {
        sendResponse({ success: true, timestamp: Date.now() });
        return false;
      }
      
      // Quick response for initialization status check
      if (message && message.action === 'CHECK_INITIALIZATION') {
        sendResponse({ 
          success: true,
          initialized: this.initializationComplete,
          uptime: Date.now() - this.startTime
        });
        return false;
      }
      
      // Pass to the message router
      return this.messageRouter.handleMessage(message, sender, sendResponse);
    });
  }
  
  setupContextMenus() {
    // Remove existing items first
    chrome.contextMenus.removeAll(() => {
      // Create context menu items
      chrome.contextMenus.create({
        id: 'options',
        title: 'Options',
        contexts: ['action']
      });
      
      chrome.contextMenus.create({
        id: 'history',
        title: 'View History',
        contexts: ['action']
      });
      
      chrome.contextMenus.create({
        id: 'mcp_test',
        title: 'MCP Test Page',
        contexts: ['action']
      });
      
      chrome.contextMenus.create({
        id: 'refresh_worker',
        title: 'Restart Extension Worker',
        contexts: ['action']
      });
    });
    
    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'options') {
        chrome.runtime.openOptionsPage();
      } else if (info.menuItemId === 'history') {
        chrome.tabs.create({ url: 'history.html' });
      } else if (info.menuItemId === 'mcp_test') {
        chrome.tabs.create({ url: 'mcp_status.html' });
      } else if (info.menuItemId === 'refresh_worker') {
        // Handle manual restart request
        this.handleManualRestart();
      }
    });
  }
  
  /**
   * Handle manual restart request from context menu
   * This doesn't actually restart the worker (as we can't do that),
   * but forces a cleanup and notifies user
   */
  async handleManualRestart() {
    try {
      console.log('Manual extension worker restart requested');
      
      // Cancel all active streams
      this.streamHandler.cancelAllStreams();
      
      // Clear any in-memory caches
      this.conversations.conversationCache.clear();
      
      // Log the restart
      await this.errorLogger.logError(
        'Manual service worker restart requested',
        'Manual Restart',
        { activeTabs: this.activePanelTabs.size },
        'info'
      );
      
      // Notify all tabs
      this.streamHandler.broadcastToAllTabs({
        action: 'SERVICE_WORKER_RESTART',
        message: 'Extension worker has been restarted.',
        timestamp: Date.now()
      });
      
      // Open a little notification to confirm restart
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Extension Worker Restarted',
        message: 'The extension background worker has been restarted.'
      });
      
      console.log('Manual extension worker restart completed');
    } catch (error) {
      console.error('Error during manual restart:', error);
      this.errorLogger.logError(
        error,
        'Manual Restart',
        { stack: error.stack },
        this.errorLogger.errorTypes.EXTENSION_ERROR
      );
    }
  }
  
  setupTabListeners() {
    // Clean up when tabs are closed or navigated
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activePanelTabs.delete(tabId);
      this.streamHandler.removeTabFromAllStreams(tabId);
    });
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading') {
        this.activePanelTabs.delete(tabId);
        this.streamHandler.removeTabFromAllStreams(tabId);
      }
    });
  }
  
  /**
   * Set up the recovery mechanism for background service
   * This is a simplified version that focuses on core health monitoring
   * without interfering with normal operations
   */
  setupRecoveryMechanism() {
    // Create an alarm that fires every 5 minutes for health checks
    chrome.alarms.create('healthCheck', { periodInMinutes: 5 });
    
    // Create a more frequent alarm for orphaned stream checks (every 30 seconds)
    chrome.alarms.create('streamCheck', { periodInMinutes: 0.5 });
    
    // Last time we checked tab existence
    this.lastTabCheck = Date.now();
    
    // Listen for the alarm
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'healthCheck') {
        this.performHealthCheck();
      } else if (alarm.name === 'streamCheck') {
        this.checkOrphanedStreams();
      }
    });
  }
  
  /**
   * Perform a health check on the service worker
   * Simplified to focus on core metrics without interfering with normal operations
   */
  async performHealthCheck() {
    try {
      const uptime = Date.now() - this.startTime;
      const activeTabs = this.activePanelTabs.size;
      const activeStreams = this.streamHandler.activeStreams.size;
      
      // Log every hour for monitoring
      if (uptime % 3600000 < 60000) {
        console.log(`Health check: Uptime ${Math.floor(uptime/3600000)}h, ${activeTabs} active tabs, ${activeStreams} active streams`);
      }
      
      // Check if tabs in activePanelTabs still exist (every 15 minutes)
      if (Date.now() - this.lastTabCheck > 900000) {
        this.verifyActiveTabs();
        this.lastTabCheck = Date.now();
      }
      
      // Check API connectivity occasionally but without triggering alerts
      if (uptime % 1800000 < 60000) { // Every 30 minutes
        const isAvailable = await this.api.isBackendAvailable(5000); // Short timeout
        if (!isAvailable) {
          console.log('API server appears to be unreachable in background check');
        }
      }
    } catch (error) {
      console.error('Error during health check:', error);
      // Don't log to error logger to avoid creating more issues
    }
  }
  
  /**
   * Check for orphaned streams more frequently
   */
  async checkOrphanedStreams() {
    try {
      // Quick check for any orphaned streams
      const activeStreams = this.streamHandler.activeStreams.size;
      if (activeStreams > 0) {
        let orphanedStreamsFound = false;
        
        for (const [agentId, _] of this.streamHandler.activeStreams) {
          const tabCount = this.streamHandler.getActiveTabCount(agentId);
          
          // If no tabs associated with this stream, it's orphaned
          if (tabCount === 0) {
            console.log(`Found orphaned stream for agent ${agentId}, canceling`);
            this.streamHandler.cancelStream(agentId);
            orphanedStreamsFound = true;
          } else {
            // Check if all tabs for this stream still exist
            const streamTabs = this.streamHandler.activeStreamTabs.get(agentId) || new Set();
            for (const tabId of streamTabs) {
              try {
                await chrome.tabs.get(tabId);
              } catch (e) {
                // Tab doesn't exist anymore
                console.log(`Tab ${tabId} associated with stream ${agentId} no longer exists, removing`);
                this.streamHandler.removeTabFromAgentStream(agentId, tabId);
                
                // If this was the last tab, cancel the stream
                if (this.streamHandler.getActiveTabCount(agentId) === 0) {
                  console.log(`No tabs left for stream ${agentId}, canceling stream`);
                  this.streamHandler.cancelStream(agentId);
                  orphanedStreamsFound = true;
                }
              }
            }
          }
        }
        
        // If any orphaned streams were found, log it
        if (orphanedStreamsFound) {
          this.errorLogger.logError(
            'Orphaned streams detected and cleaned up',
            'Stream Health Check',
            { activeStreamsAfter: this.streamHandler.activeStreams.size },
            'info'
          );
        }
      }
    } catch (error) {
      console.error('Error checking orphaned streams:', error);
    }
  }
  
  /**
   * Verify that all active tabs still exist in the browser
   * and clean up any that don't
   */
  async verifyActiveTabs() {
    const tabsToRemove = new Set();
    
    // Check each tab in our active list
    for (const tabId of this.activePanelTabs) {
      try {
        await chrome.tabs.get(tabId);
      } catch (e) {
        // Tab doesn't exist, mark for removal
        tabsToRemove.add(tabId);
      }
    }
    
    // Remove any non-existent tabs
    if (tabsToRemove.size > 0) {
      for (const tabId of tabsToRemove) {
        this.activePanelTabs.delete(tabId);
        this.streamHandler.removeTabFromAllStreams(tabId);
      }
      
      console.log(`Removed ${tabsToRemove.size} non-existent tabs from tracking`);
      
      // Log this cleanup
      this.errorLogger.logError(
        'Removed non-existent tabs from tracking',
        'Tab Verification',
        { 
          removedCount: tabsToRemove.size,
          remainingTabs: this.activePanelTabs.size
        },
        'info'
      );
    }
  }
  
  /**
   * Get or create an MCP connector for the given server URL
   * @param {string} mcpServerUrl - The MCP server URL
   * @returns {MCPConnector} - The MCP connector instance
   */
  getOrCreateMCPConnector(mcpServerUrl) {
    if (!mcpServerUrl) {
      throw new Error('MCP server URL is required');
    }
    
    // Check if we already have a connector for this URL
    if (this.mcpConnectors.has(mcpServerUrl)) {
      return this.mcpConnectors.get(mcpServerUrl);
    }
    
    // Create new connector
    console.log(`Creating new MCP connector for: ${mcpServerUrl}`);
    const connector = new MCPConnector(mcpServerUrl);
    this.mcpConnectors.set(mcpServerUrl, connector);
    
    return connector;
  }
  
  /**
   * Set up MCP connector cleanup
   */
  setupMCPCleanup() {
    // Clean up MCP connectors periodically
    chrome.alarms.create('mcpCleanup', { periodInMinutes: 30 });
    
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'mcpCleanup') {
        this.cleanupMCPConnectors();
      }
    });
  }
  
  /**
   * Clean up unused MCP connectors
   */
  async cleanupMCPConnectors() {
    try {
      // Get all current agents
      const agents = this.agents.getAllAgents();
      const activeUrls = new Set(
        agents
          .filter(agent => agent.backendType === 'mcp' && agent.mcpServerUrl)
          .map(agent => agent.mcpServerUrl)
      );
      
      // Remove connectors that are no longer used
      for (const [url, connector] of this.mcpConnectors.entries()) {
        if (!activeUrls.has(url)) {
          console.log(`Cleaning up unused MCP connector: ${url}`);
          try {
            connector.disconnect();
          } catch (e) {
            console.warn(`Error disconnecting MCP connector ${url}:`, e);
          }
          this.mcpConnectors.delete(url);
        }
      }
    } catch (error) {
      console.error('Error during MCP connector cleanup:', error);
    }
  }
}

// Create and initialize the application
const app = new BackgroundApp();
app.initialize();