/**
 * Enhanced Error Logger
 * 
 * Provides robust error logging, categorization, and reporting capabilities
 */

class ErrorLogger {
  constructor(storageManager) {
    this.storage = storageManager;
    this.maxStoredErrors = 100;
    this.errorHistory = [];
    this.initialized = false;
    this.errorTypes = {
      API_ERROR: 'api_error',
      NETWORK_ERROR: 'network_error',
      SERVICE_WORKER_ERROR: 'service_worker_error',
      EXTENSION_ERROR: 'extension_error',
      UNKNOWN_ERROR: 'unknown_error'
    };
  }
  
  /**
   * Initialize the logger and load error history
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      const data = await this.storage.get('errorHistory', []);
      this.errorHistory = data.errorHistory || [];
      
      // Truncate history if needed
      if (this.errorHistory.length > this.maxStoredErrors) {
        this.errorHistory = this.errorHistory.slice(-this.maxStoredErrors);
        await this.persistErrors();
      }
      
      this.initialized = true;
      console.log('ErrorLogger initialized with', this.errorHistory.length, 'stored errors');
    } catch (error) {
      console.error('Failed to initialize error logger:', error);
      this.errorHistory = [];
      this.initialized = true; // Mark as initialized anyway to avoid repeated init attempts
    }
  }
  
  /**
   * Log an error with metadata
   * 
   * @param {Error|string} error - The error object or message
   * @param {string} context - Where the error occurred
   * @param {Object} metadata - Additional data about the error
   * @param {string} type - Error type from this.errorTypes
   */
  async logError(error, context, metadata = {}, type = null) {
    await this.ensureInitialized();
    
    // Determine error type
    const errorType = type || this.categorizeError(error);
    
    // Format error for storage
    const errorEntry = {
      timestamp: Date.now(),
      type: errorType,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      context,
      metadata,
      browser: this.getBrowserInfo()
    };
    
    // Store in memory
    this.errorHistory.push(errorEntry);
    if (this.errorHistory.length > this.maxStoredErrors) {
      this.errorHistory.shift(); // Remove oldest error
    }
    
    // Log to console with context-specific formatting
    this.consoleLogError(errorEntry);
    
    // Persist to storage (but don't await to avoid blocking)
    this.persistErrors().catch(e => 
      console.error('Failed to persist error log:', e)
    );
    
    return errorEntry;
  }
  
  /**
   * Log API errors specifically
   */
  async logApiError(error, endpoint, requestData = {}) {
    return this.logError(
      error, 
      'API Request', 
      { 
        endpoint, 
        requestData: this.safeStringify(requestData),
        statusCode: error.statusCode || null
      }, 
      this.errorTypes.API_ERROR
    );
  }
  
  /**
   * Log service worker errors specifically
   */
  async logServiceWorkerError(error, action = null) {
    return this.logError(
      error,
      'Service Worker',
      { action },
      this.errorTypes.SERVICE_WORKER_ERROR
    );
  }
  
  /**
   * Categorize an error based on its properties and message
   */
  categorizeError(error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('API') || 
        errorMsg.includes('api') || 
        errorMsg.includes('endpoint')) {
      return this.errorTypes.API_ERROR;
    }
    
    if (errorMsg.includes('network') || 
        errorMsg.includes('fetch') || 
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('unreachable')) {
      return this.errorTypes.NETWORK_ERROR;
    }
    
    if (errorMsg.includes('Extension context') ||
        errorMsg.includes('service worker') ||
        errorMsg.includes('connection') ||
        errorMsg.includes('Could not establish connection')) {
      return this.errorTypes.SERVICE_WORKER_ERROR;
    }
    
    return this.errorTypes.UNKNOWN_ERROR;
  }
  
  /**
   * Format console output for different error types
   */
  consoleLogError(errorEntry) {
    const timestamp = new Date(errorEntry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${errorEntry.type}]`;
    
    // Format metadata for display
    const formattedMetadata = Object.entries(errorEntry.metadata)
      .map(([key, value]) => {
        if (key === 'startupTime') {
          return `startup time: ${value}ms`;
        }
        if (key === 'activeTabs') {
          return `active tabs: ${value}`;
        }
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${this.safeStringify(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join(', ');
    
    // Special handling for info messages
    if (errorEntry.type === 'info') {
      console.info(
        `${prefix} ${errorEntry.context}: ${errorEntry.message}${formattedMetadata ? ` (${formattedMetadata})` : ''}`
      );
      return;
    }
    
    switch (errorEntry.type) {
      case this.errorTypes.API_ERROR:
        console.error(
          `${prefix} API Error in ${errorEntry.context}:`, 
          errorEntry.message,
          formattedMetadata ? `\nDetails: ${formattedMetadata}` : ''
        );
        break;
      
      case this.errorTypes.SERVICE_WORKER_ERROR:
        console.error(
          `${prefix} Service Worker Error:`,
          errorEntry.message,
          errorEntry.metadata.action ? `\nAction: ${errorEntry.metadata.action}` : '',
          errorEntry.stack ? `\nStack: ${errorEntry.stack}` : '',
          formattedMetadata ? `\nDetails: ${formattedMetadata}` : ''
        );
        break;
      
      case this.errorTypes.NETWORK_ERROR:
        console.error(
          `${prefix} Network Error:`,
          errorEntry.message,
          `\nContext: ${errorEntry.context}`,
          formattedMetadata ? `\nDetails: ${formattedMetadata}` : ''
        );
        break;
      
      default:
        console.error(
          `${prefix} Error in ${errorEntry.context}:`,
          errorEntry.message,
          formattedMetadata ? `\nDetails: ${formattedMetadata}` : ''
        );
    }
  }
  
  /**
   * Persist errors to storage
   */
  async persistErrors() {
    if (!this.initialized) return;
    
    try {
      await this.storage.set('errorHistory', this.errorHistory);
    } catch (error) {
      console.error('Failed to persist error history:', error);
    }
  }
  
  /**
   * Safely stringify objects for error logging
   */
  safeStringify(obj, maxLength = 1000) {
    try {
      // Remove API keys and similar sensitive data
      const sanitized = JSON.parse(JSON.stringify(obj, (key, value) => {
        if (/key|token|secret|password|auth/i.test(key)) {
          return '[REDACTED]';
        }
        return value;
      }));
      
      const result = JSON.stringify(sanitized);
      if (result.length > maxLength) {
        return result.substring(0, maxLength) + '... [truncated]';
      }
      return result;
    } catch (e) {
      return '[Error: Could not stringify object]';
    }
  }
  
  /**
   * Get basic browser information for error context
   */
  getBrowserInfo() {
    try {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      };
    } catch (e) {
      return { userAgent: 'unknown' };
    }
  }
  
  /**
   * Get error history, optionally filtered by type
   */
  async getErrorHistory(type = null, limit = 50) {
    await this.ensureInitialized();
    
    let filteredHistory = this.errorHistory;
    
    if (type) {
      filteredHistory = filteredHistory.filter(e => e.type === type);
    }
    
    // Return most recent errors first
    return filteredHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Clear error history
   */
  async clearErrorHistory() {
    this.errorHistory = [];
    return this.persistErrors();
  }
  
  /**
   * Ensure the logger is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  /**
   * Create a wrapped version of a function that automatically logs errors
   * 
   * @param {Function} fn - The function to wrap
   * @param {string} context - Context for error logging
   * @returns {Function} - Wrapped function with error logging
   */
  wrapWithErrorLogging(fn, context) {
    const logger = this;
    
    return async function(...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        await logger.logError(error, context, { arguments: args });
        throw error; // Re-throw to preserve original behavior
      }
    };
  }
}

export default ErrorLogger;