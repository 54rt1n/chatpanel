/**
 * Stream Handler
 * 
 * Manages streaming responses from the LLM API and broadcasts to appropriate tabs
 * Enhanced with better error handling and recovery mechanisms
 */

class StreamHandler {
  constructor(agentManager) {
    this.agents = agentManager;
    this.activeStreams = new Map(); // Map of agentId -> stream reader
    this.activeStreamTabs = new Map(); // Map of agentId -> Set of tab IDs
    this.streamErrors = new Map(); // Map of agentId -> last stream error
    this.collectedContent = '';
    this.MAX_BUFFER_SIZE = 100000; // Limit collected content to ~100KB per stream
  }
  
  /**
   * Add a tab to receive stream updates for an agent
   */
  addTabToAgentStream(agentId, tabId) {
    let tabs = this.activeStreamTabs.get(agentId);
    if (!tabs) {
      tabs = new Set();
      this.activeStreamTabs.set(agentId, tabs);
    }
    tabs.add(tabId);
    console.log(`Added tab ${tabId} to agent ${agentId} stream`);

    // If there's an active stream, send the accumulated content to the new tab
    if (this.activeStreams.has(agentId) && this.collectedContent) {
      // Send the accumulated content as if it was the first chunk
      chrome.tabs.sendMessage(tabId, {
        action: 'STREAM_CONTENT',
        content: this.collectedContent,
        isFirst: true,
        agentId
      }).catch(error => {
        console.warn(`Failed to send accumulated content to new tab ${tabId}:`, error.message);
      });
    }
  }
  
  /**
   * Remove a tab from all agent streams
   */
  removeTabFromAllStreams(tabId) {
    for (const tabs of this.activeStreamTabs.values()) {
      tabs.delete(tabId);
    }
    console.log(`Removed tab ${tabId} from all streams`);
  }
  
  /**
   * Register a new stream for an agent
   */
  registerStream(agentId, streamReader, tabId) {
    // Cancel existing stream for this agent if any
    const existingStream = this.activeStreams.get(agentId);
    if (existingStream) {
      try {
        existingStream.cancel('New stream started');
      } catch (e) {
        console.warn('Error canceling previous stream:', e);
      }
    }
    
    // Set new stream
    this.activeStreams.set(agentId, streamReader);
    
    // Reset collected content for new stream
    this.collectedContent = '';
    
    // Add tab to stream recipients
    this.addTabToAgentStream(agentId, tabId);
    
    // Clear any previous stream errors
    this.streamErrors.delete(agentId);
    
    console.log(`Registered new stream for agent ${agentId}`);
  }
  
  /**
   * Broadcast a message to all tabs for a specific agent
   */
  broadcastToAgentTabs(agentId, message) {
    const tabs = this.activeStreamTabs.get(agentId) || new Set();
    const tabsToRemove = new Set();
    
    tabs.forEach(async tabId => {
      try {
        // Check if tab still exists
        let tabExists = true;
        try {
          await chrome.tabs.get(tabId);
        } catch (e) {
          tabExists = false;
          tabsToRemove.add(tabId);
          return;
        }
        
        if (!tabExists) return;
        
        // Send the message with catch for runtime errors
        chrome.tabs.sendMessage(tabId, message).catch(error => {
          console.warn(`Failed to send message to tab ${tabId}:`, error.message);
          
          // Remove tab from active tabs if connection is broken
          if (error.message.includes('Could not establish connection') || 
              error.message.includes('receiving end does not exist') ||
              error.message.includes('Extension context invalidated')) {
            tabsToRemove.add(tabId);
          }
        });
      } catch (error) {
        console.error('Error broadcasting to agent tab:', tabId, error);
        // Remove problematic tab from the set
        tabsToRemove.add(tabId);
      }
    });
    
    // Remove any problematic tabs
    if (tabsToRemove.size > 0) {
      const updatedTabs = new Set([...tabs].filter(tabId => !tabsToRemove.has(tabId)));
      this.activeStreamTabs.set(agentId, updatedTabs);
      console.log(`Removed ${tabsToRemove.size} unresponsive tabs from agent ${agentId} stream`);
    }
  }
  
  /**
   * Broadcast a message to all active tabs
   */
  broadcastToAllTabs(message) {
    for (const [agentId, tabs] of this.activeStreamTabs.entries()) {
      if (tabs.size > 0) {
        this.broadcastToAgentTabs(agentId, message);
      }
    }
  }
  
  /**
   * Process a stream for a specific agent
   */
  async processStream(agentId) {
    const streamReader = this.activeStreams.get(agentId);
    if (!streamReader) {
      throw new Error('No active stream for this agent');
    }
    
    let isFirst = true;
    const decoder = new TextDecoder();
    console.log(`Starting to process stream for agent ${agentId}`);
    
    // Reset current content for this agent
    this.collectedContent = '';
    let buffer = ''; // Buffer for incomplete chunks
    let watchdogInterval = null;
    let streamActive = true;
    
    try {
      // Set up a simple watchdog timer that only detects complete inactivity
      watchdogInterval = setInterval(() => {
        if (!streamActive) {
          console.log(`Stream for agent ${agentId} appears inactive, but we'll let it finish naturally`);
        }
      }, 30000); // Only check after 30 seconds of inactivity
      
      while (streamActive) {
        try {
          const { value, done } = await streamReader.read();
          
          if (done) {
            console.log('Stream complete');
            // Process any remaining buffer content
            if (buffer.trim()) {
              try {
                const data = JSON.parse(buffer);
                const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
                if (content) {
                  this.appendToCollectedContent(content);
                  this.broadcastToAgentTabs(agentId, {
                    action: 'STREAM_CONTENT',
                    content,
                    isFirst,
                    agentId
                  });
                  isFirst = false;
                }
              } catch (e) {
                console.warn('Error processing final buffer:', e);
              }
            }
            streamActive = false;
            break;
          }
          
          const chunk = decoder.decode(value);
          buffer += chunk;
          const lines = buffer.split('\n');
          
          // Keep the last line in the buffer if it's incomplete
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim() || line.includes('[DONE]')) continue;
            
            try {
              const jsonStr = line.replace(/^data: /, '').trim();
              if (!jsonStr) continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
              if (!content) continue;
              
              this.appendToCollectedContent(content);
              
              this.broadcastToAgentTabs(agentId, {
                action: 'STREAM_CONTENT',
                content,
                isFirst,
                agentId
              });
              
              isFirst = false;
            } catch (e) {
              console.warn('Error parsing streaming data:', e, 'Line:', line);
              // Don't break the stream on parse errors
              continue;
            }
          }
        } catch (chunkError) {
          // Handle errors during reading of a chunk
          console.error('Error reading stream chunk:', chunkError);
          
          // If this is a network error or a cancellation, we need to stop
          if (chunkError.name === 'TypeError' || 
              chunkError.name === 'AbortError' ||
              chunkError.message.includes('cancel') ||
              chunkError.message.includes('network error')) {
            // Just break the loop instead of throwing - this allows for clean shutdown
            streamActive = false;
            break;
          }
          
          // For other errors, try to continue
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return this.collectedContent;
    } catch (error) {
      console.error('Error processing stream:', error);
      
      // If this is not a user-initiated cancellation, show error
      if (!error.message.includes('New stream started')) {
        this.broadcastToAgentTabs(agentId, {
          action: 'SHOW_ERROR',
          error: 'Error processing response stream: ' + error.message,
          agentId
        });
      }
      
      throw error;
    } finally {
      // Clean up watchdog timer
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }
      
      console.log('Stream processing complete, hiding loading indicator');
      this.broadcastToAgentTabs(agentId, { 
        action: 'HIDE_LOADING',
        agentId
      });
      this.activeStreams.delete(agentId);
    }
  }
  
  /**
   * Append content to the collected content buffer with size limits
   * @param {string} content - Content to append
   */
  appendToCollectedContent(content) {
    this.collectedContent += content;
    
    // If we exceed the maximum buffer size, trim the content
    if (this.collectedContent.length > this.MAX_BUFFER_SIZE) {
      // Keep the most recent content by trimming from the beginning
      // This preserves context for any new tabs that might join
      const excessLength = this.collectedContent.length - this.MAX_BUFFER_SIZE;
      this.collectedContent = this.collectedContent.substring(excessLength);
      
      // Make sure we don't cut in the middle of a word or a UTF-8 character
      // Find the first space after the beginning of the string
      const firstSpaceIndex = this.collectedContent.indexOf(' ');
      if (firstSpaceIndex > 0) {
        this.collectedContent = this.collectedContent.substring(firstSpaceIndex + 1);
      }
      
      console.log(`Trimmed collected content to prevent memory growth (current size: ${this.collectedContent.length} bytes)`);
    }
  }
  
  /**
   * Check if a stream is active for an agent
   */
  isStreamActive(agentId) {
    return this.activeStreams.has(agentId);
  }
  
  /**
   * Get the number of active tabs for an agent
   */
  getActiveTabCount(agentId) {
    const tabs = this.activeStreamTabs.get(agentId);
    return tabs ? tabs.size : 0;
  }
  
  /**
   * Cancel a specific stream
   * @param {string} agentId - The agent ID of the stream to cancel
   */
  cancelStream(agentId) {
    const streamReader = this.activeStreams.get(agentId);
    if (streamReader) {
      try {
        streamReader.cancel('Stream cancelled');
        console.log(`Cancelled stream for agent ${agentId}`);
      } catch (e) {
        console.warn(`Error cancelling stream for agent ${agentId}:`, e);
      }
      
      this.activeStreams.delete(agentId);
      
      // Notify all tabs that the stream was cancelled
      this.broadcastToAgentTabs(agentId, {
        action: 'HIDE_LOADING',
        agentId
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Cancel all active streams
   */
  cancelAllStreams() {
    for (const [agentId, streamReader] of this.activeStreams.entries()) {
      try {
        streamReader.cancel('User cancelled');
        console.log(`Cancelled stream for agent ${agentId}`);
      } catch (e) {
        console.warn(`Error cancelling stream for agent ${agentId}:`, e);
      }
    }
    
    this.activeStreams.clear();
    console.log('All streams cancelled');
  }
  
  /**
   * Remove a tab from a specific agent's stream
   * @param {string} agentId - The agent ID
   * @param {number} tabId - The tab ID to remove
   */
  removeTabFromAgentStream(agentId, tabId) {
    const tabs = this.activeStreamTabs.get(agentId);
    if (tabs) {
      tabs.delete(tabId);
      console.log(`Removed tab ${tabId} from agent ${agentId} stream`);
      
      // If no tabs left for this agent, consider canceling the stream
      if (tabs.size === 0 && this.activeStreams.has(agentId)) {
        console.log(`No more tabs for agent ${agentId}, stream might become orphaned`);
      }
    }
  }
}

export default StreamHandler;