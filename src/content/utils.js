/**
 * Utility functions for content script
 */

/**
 * Safe wrapper around chrome.runtime.sendMessage that handles extension context invalidation
 * @param {Object} message - The message to send
 * @param {Function} onError - Optional callback for handling errors
 * @returns {Promise} - Resolves with the response or rejects with error
 */
export async function safeSendMessage(message, onError) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    return response;
  } catch (error) {
    console.error('Chrome runtime error:', error);
    
    // Check if this is an extension context invalidated error
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('Extension context was invalidated')) {
      const reloadError = new Error('The extension needs to be reloaded. Please refresh the page.');
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