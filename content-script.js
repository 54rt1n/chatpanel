// Function to gather page information
function gatherPageInfo() {
  console.log('Gathering page information');
  const info = {
    url: window.location.href,
    text: document.body.innerText.slice(0, 3000),
    title: document.title
  };
  console.log('Page info gathered:', {
    url: info.url,
    title: info.title,
    textLength: info.text.length
  });
  return info;
}

// Helper function to safely escape HTML and preserve formatting
function formatContent(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

// Listen for chat messages from the panel
document.addEventListener('ai_assistant_chat', (event) => {
  console.log('Content script received chat event:', event.detail);
  // Gather current page info for context
  const pageInfo = gatherPageInfo();
  chrome.runtime.sendMessage({
    action: 'CHAT_MESSAGE',
    data: {
      message: event.detail.message,
      url: pageInfo.url,
      pageContent: pageInfo.text,
      title: pageInfo.title
    }
  }, (response) => {
    console.log('Got response from chat message:', response);
    if (chrome.runtime.lastError) {
      console.error('Error sending chat message:', chrome.runtime.lastError);
    }
  });
});

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', {
    action: request.action,
    hasContent: !!request.content,
    isFirst: request.isFirst,
    sender: sender.id
  });

  if (request.action === 'CAPTURE_PAGE') {
    console.log('Capturing page content');
    const pageData = gatherPageInfo();
    console.log('Sending response back to popup');
    sendResponse({ success: true, data: pageData });
  } 
  else if (request.action === 'SHOW_LOADING') {
    console.log('Showing loading state');
    const panel = document.querySelector('.ai-assistant-panel');
    if (panel) {
      const loadingIndicator = panel.querySelector('.loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        console.log('Loading indicator displayed');
      } else {
        console.warn('Loading indicator element not found');
      }
      const content = panel.querySelector('.panel-content');
      if (content) {
        content.innerHTML = '<p>Analyzing page...</p>';
        console.log('Content area updated with loading message');
      } else {
        console.warn('Content element not found');
      }
    } else {
      console.warn('Panel not found when trying to show loading state');
    }
  }
  else if (request.action === 'HIDE_LOADING') {
    console.log('Hiding loading state');
    const panel = document.querySelector('.ai-assistant-panel');
    if (panel) {
      const loadingIndicator = panel.querySelector('.loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        console.log('Loading indicator hidden');
      } else {
        console.warn('Loading indicator element not found');
      }
    } else {
      console.warn('Panel not found when trying to hide loading state');
    }
  }
  else if (request.action === 'STREAM_CONTENT') {
    console.log('Processing stream content', {
      isFirst: request.isFirst,
      contentLength: request.content.length
    });
    const panel = document.querySelector('.ai-assistant-panel');
    if (panel) {
      const content = panel.querySelector('.panel-content');
      if (content) {
        if (request.isFirst) {
          console.log('First chunk received, initializing content area');
          content.innerHTML = '';
          // Add a pre element for formatting
          const pre = document.createElement('pre');
          pre.style.cssText = `
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            line-height: inherit;
          `;
          content.appendChild(pre);
          console.log('Pre element created for formatted content');
        }
        const pre = content.querySelector('pre');
        if (pre) {
          const formattedContent = formatContent(request.content);
          pre.innerHTML += formattedContent;
          // Scroll to bottom to show new content
          content.scrollTop = content.scrollHeight;
          console.log('Content chunk added and scrolled to bottom');
        } else {
          console.warn('Pre element not found for content append');
        }
      } else {
        console.warn('Content element not found');
      }
    } else {
      console.warn('Panel not found when trying to stream content');
    }
  }
  else if (request.action === 'SHOW_ERROR') {
    console.error('Showing error message:', request.error);
    const panel = document.querySelector('.ai-assistant-panel');
    if (panel) {
      const content = panel.querySelector('.panel-content');
      if (content) {
        content.innerHTML = `<p style="color: red;">Error: ${formatContent(request.error)}</p>`;
        console.log('Error message displayed in panel');
      } else {
        console.warn('Content element not found');
      }
      const loadingIndicator = panel.querySelector('.loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        console.log('Loading indicator hidden after error');
      } else {
        console.warn('Loading indicator element not found');
      }
    } else {
      console.warn('Panel not found when trying to show error');
    }
  } else {
    console.warn('Unknown message action received:', request.action);
  }

  return true;
});