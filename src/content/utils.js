/**
 * Utility functions for content script
 */

// Track connection state
let isReconnecting = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Check if the service worker is running
 * @returns {Promise<boolean>} True if worker is active
 */
async function isServiceWorkerActive() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'PING' });
    return response && response.success;
  } catch (error) {
    return false;
  }
}

/**
 * Notify user about service worker issues with option to reload
 * @param {string} message - The message to show
 */
function notifyUserOfServiceWorkerIssue(message) {
  // Create a notification element if it doesn't exist
  let notification = document.getElementById('extension-service-notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'extension-service-notification';
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background-color: #f44336;
      color: white;
      padding: 15px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      max-width: 300px;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      float: right;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
      margin-left: 10px;
    `;
    closeBtn.onclick = () => notification.remove();
    
    notification.appendChild(closeBtn);
    document.body.appendChild(notification);
  }
  
  // Add a refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh Page';
  refreshBtn.style.cssText = `
    background-color: white;
    color: #f44336;
    border: none;
    padding: 5px 10px;
    border-radius: 3px;
    margin-top: 10px;
    cursor: pointer;
    font-weight: bold;
  `;
  refreshBtn.onclick = () => window.location.reload();
  
  // Set message content
  notification.innerHTML = `
    <span style="display: block; margin-right: 20px;">
      ${message}
    </span>
  `;
  notification.appendChild(refreshBtn);
}

/**
 * Store pending operations to resume after refresh
 * @param {Object} operation - The operation to store
 */
function storePendingOperation(operation) {
  try {
    const pendingOps = JSON.parse(localStorage.getItem('pendingOperations') || '[]');
    pendingOps.push({
      ...operation,
      timestamp: Date.now()
    });
    localStorage.setItem('pendingOperations', JSON.stringify(pendingOps));
    console.log('Stored pending operation for later execution');
  } catch (e) {
    console.error('Failed to store pending operation:', e);
  }
}

/**
 * Safe wrapper around chrome.runtime.sendMessage that handles extension context invalidation
 * No automatic restart - instead, provides clear user guidance on what to do
 * 
 * @param {Object} message - The message to send
 * @param {Function} onError - Optional callback for handling errors
 * @param {number} retryCount - Internal retry counter
 * @returns {Promise} - Resolves with the response or rejects with error
 */
export async function safeSendMessage(message, onError, retryCount = 0) {
  try {
    // If already trying to reconnect, wait a bit
    if (isReconnecting) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }

    // Check if service worker is active
    if (!await isServiceWorkerActive()) {
      console.log('Service worker is not active');
      isReconnecting = true;
      
      // If we've tried too many times, give up and notify the user
      if (retryCount >= MAX_RETRIES) {
        const errorMsg = 'The extension service worker is not responding. You may need to refresh the page.';
        notifyUserOfServiceWorkerIssue(errorMsg);
        
        // Store the operation to resume after refresh
        if (message && message.action) {
          storePendingOperation(message);
        }
        
        throw new Error(errorMsg);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      
      // Try again
      return safeSendMessage(message, onError, retryCount + 1);
    }

    // Send the message
    const response = await chrome.runtime.sendMessage(message);
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    
    // Reset reconnection state on successful message
    isReconnecting = false;
    return response;
  } catch (error) {
    console.error('Chrome runtime error:', error);
    
    // Check if this is an extension context invalidated error
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('Extension context was invalidated') ||
        error.message.includes('Could not establish connection')) {
      
      isReconnecting = true;

      // If we haven't exceeded max retries, try again
      if (retryCount < MAX_RETRIES) {
        console.log(`Attempting to reconnect... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        
        try {
          // Try the original message again
          return await safeSendMessage(message, onError, retryCount + 1);
        } catch (reconnectError) {
          console.error('Reconnection attempt failed:', reconnectError);
        }
      }

      // If we've exhausted retries, show reload message
      const reloadError = new Error('The extension connection was lost. Please refresh the page to reconnect.');
      notifyUserOfServiceWorkerIssue(reloadError.message);
      
      // Store the operation for later
      if (message && message.action) {
        storePendingOperation(message);
      }
      
      if (onError) {
        onError(reloadError);
      }
      throw reloadError;
    }
    
    // For other errors, just pass through
    if (onError) {
      onError(error);
    }
    throw error;
  }
}

/**
 * Check for and process any pending operations after page load
 * Should be called during initialization
 */
export function processPendingOperations() {
  try {
    const pendingOps = JSON.parse(localStorage.getItem('pendingOperations') || '[]');
    if (pendingOps.length > 0) {
      console.log(`Found ${pendingOps.length} pending operations to process`);
      
      // Filter out old operations (older than 1 hour)
      const now = Date.now();
      const validOps = pendingOps.filter(op => now - op.timestamp < 3600000);
      
      // Process valid operations
      if (validOps.length > 0) {
        console.log(`Processing ${validOps.length} valid pending operations`);
        
        // Execute the most recent operation of each type
        const operationsByType = {};
        validOps.forEach(op => {
          // Use action as the type key
          const key = op.action;
          if (!operationsByType[key] || op.timestamp > operationsByType[key].timestamp) {
            operationsByType[key] = op;
          }
        });
        
        // Execute each operation
        Object.values(operationsByType).forEach(op => {
          console.log(`Resuming operation: ${op.action}`);
          setTimeout(() => {
            safeSendMessage(op).catch(err => 
              console.warn(`Failed to resume operation ${op.action}:`, err)
            );
          }, 1000); // Give the service worker time to initialize
        });
      }
      
      // Clear pending operations
      localStorage.removeItem('pendingOperations');
    }
  } catch (e) {
    console.error('Error processing pending operations:', e);
  }
}