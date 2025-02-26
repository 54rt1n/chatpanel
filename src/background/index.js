/**
 * Background Script Entry Point
 * 
 * This is the main entry point for the service worker.
 * It imports all needed modules and initializes the extension.
 */

import StorageManager from '../shared/storage';
import AgentManager from '../shared/agents';
import ConversationManager from '../shared/conversations';
import MessageRouter from './message-router';
import StreamHandler from './stream-handler';
import ApiClient from './api';

console.log('Background script loaded and running');

// Main application class
class BackgroundApp {
    constructor() {
  // Initialize managers
  this.storage = new StorageManager();
  this.agents = new AgentManager(this.storage);
  this.conversations = new ConversationManager(this.storage);
  this.api = new ApiClient(this.storage, this.agents);  // Pass agents manager
  this.streamHandler = new StreamHandler(this.agents);
  
  // Initialize message router
  this.messageRouter = new MessageRouter(
    this.agents,
    this.conversations,
    this.api,
    this.streamHandler
  );
  
  // State tracking
  this.activePanelTabs = new Set();
}
  
  async initialize() {
    try {
      // Initialize all managers
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
      
      console.log('Background application initialized successfully');
    } catch (error) {
      console.error('Error initializing background app:', error);
    }
  }
  
  setupMessageListeners() {
    // Listen for messages from content scripts, popup, etc.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Pass to the message router
      return this.messageRouter.handleMessage(message, sender, sendResponse);
    });
  }
  
  setupContextMenus() {
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
    
    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'options') {
        chrome.runtime.openOptionsPage();
      } else if (info.menuItemId === 'history') {
        chrome.tabs.create({ url: 'history.html' });
      }
    });
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
}

// Create and initialize the application
const app = new BackgroundApp();
app.initialize();