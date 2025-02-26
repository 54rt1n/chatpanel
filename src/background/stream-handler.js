/**
 * Stream Handler
 * 
 * Manages streaming responses from the LLM API and broadcasts to appropriate tabs
 */

class StreamHandler {
  constructor(agentManager) {
    this.agents = agentManager;
    this.activeStreams = new Map(); // Map of agentId -> stream reader
    this.activeStreamTabs = new Map(); // Map of agentId -> Set of tab IDs
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
        existingStream.cancel();
      } catch (e) {
        console.warn('Error canceling previous stream:', e);
      }
    }
    
    // Set new stream
    this.activeStreams.set(agentId, streamReader);
    
    // Add tab to stream recipients
    this.addTabToAgentStream(agentId, tabId);
    
    console.log(`Registered new stream for agent ${agentId}`);
  }
  
  /**
   * Broadcast a message to all tabs for a specific agent
   */
  broadcastToAgentTabs(agentId, message) {
  const tabs = this.activeStreamTabs.get(agentId) || new Set();
  
  tabs.forEach(async tabId => {
    try {
      // Check if tab still exists
      let tabExists = true;
      try {
        await chrome.tabs.get(tabId);
      } catch (e) {
        tabExists = false;
        tabs.delete(tabId);
        return;
      }
      
      if (!tabExists) return;
      
      // Send the message with catch for runtime errors
      chrome.tabs.sendMessage(tabId, message).catch(error => {
        console.warn(`Failed to send message to tab ${tabId}:`, error.message);
        
        // Remove tab from active tabs if connection is broken
        if (error.message.includes('Could not establish connection') || 
            error.message.includes('receiving end does not exist')) {
          tabs.delete(tabId);
          console.log(`Removed unresponsive tab ${tabId} from agent ${agentId} stream`);
        }
      });
    } catch (error) {
      console.error('Error broadcasting to agent tab:', tabId, error);
      // Remove problematic tab from the set
      tabs.delete(tabId);
    }
  });
}
  
  /**
   * Broadcast a message to all active tabs
   */
  broadcastToAllTabs(message) {
    for (const [agentId, tabs] of this.activeStreamTabs.entries()) {
      this.broadcastToAgentTabs(agentId, message);
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
    let collectedContent = '';
    let buffer = ''; // Buffer for incomplete chunks
    
    try {
      while (true) {
        const { value, done } = await streamReader.read();
        if (done) {
          console.log('Stream complete');
          // Process any remaining buffer content
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
              if (content) {
                collectedContent += content;
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
            
            collectedContent += content;
            
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
      }
      return collectedContent;
    } catch (error) {
      console.error('Error processing stream:', error);
      this.broadcastToAgentTabs(agentId, {
        action: 'SHOW_ERROR',
        error: 'Error processing response stream: ' + error.message,
        agentId
      });
      throw error;
    } finally {
      console.log('Stream processing complete, hiding loading indicator');
      this.broadcastToAgentTabs(agentId, { 
        action: 'HIDE_LOADING',
        agentId
      });
      this.activeStreams.delete(agentId);
    }
  }
}

export default StreamHandler;