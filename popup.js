console.log('Popup script starting to load');

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded');
  const toggleBtn = document.getElementById('toggleBtn');
  const captureBtn = document.getElementById('captureBtn');
  
  console.log('Buttons found:', { 
    toggleBtn: !!toggleBtn, 
    captureBtn: !!captureBtn 
  });

  // First, check if panel exists and update button text
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    console.log('Got active tab:', tabs[0]?.id);
    const [tab] = tabs;
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        console.log('Checking panel existence in page');
        const panel = document.querySelector('.ai-assistant-panel');
        return panel && panel.style.display !== 'none';
      }
    });
    console.log('Panel visibility check result:', result);
    toggleBtn.textContent = result ? 'Hide Panel' : 'Show Panel';
  });

  toggleBtn.addEventListener('click', async () => {
    console.log('Toggle button clicked');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Toggle button clicked, executing panel script for tab:', tab.id);
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        console.log('Panel script executing');
        let panel = document.querySelector('.ai-assistant-panel');
        
        if (!panel) {
          console.log('Creating new panel');
          // Create panel if it doesn't exist
          panel = document.createElement('div');
          panel.className = 'ai-assistant-panel';
          // Set initial display state explicitly
          panel.style.display = 'flex';
          panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            max-height: 500px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            border: 1px solid #e1e4e8;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          `;

          // Add header with gradient background
          const header = document.createElement('div');
          header.style.cssText = `
            padding: 12px 16px;
            background: linear-gradient(to right, #4CAF50, #45a049);
            border-bottom: 1px solid #e1e4e8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: white;
          `;

          const title = document.createElement('span');
          title.textContent = 'AI Assistant';
          title.style.fontWeight = 'bold';

          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '×';
          closeBtn.style.cssText = `
            border: none;
            background: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 24px;
            opacity: 0.8;
            transition: opacity 0.2s;
          `;
          closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
          closeBtn.onmouseout = () => closeBtn.style.opacity = '0.8';
          closeBtn.onclick = () => {
            console.log('Panel close button clicked');
            panel.style.display = 'none';
            // Send message to update popup button text
            chrome.runtime.sendMessage({ action: 'UPDATE_BUTTON', isVisible: false });
          };

          header.appendChild(title);
          header.appendChild(closeBtn);

          // Add content area
          const content = document.createElement('div');
          content.className = 'panel-content';
          content.style.cssText = `
            padding: 16px;
            flex-grow: 1;
            overflow-y: auto;
            background-color: white;
            color: #333;
            font-size: 14px;
            line-height: 1.5;
          `;
          content.innerHTML = '<p>Click "Capture Page" to analyze this page.</p>';

          // Add loading indicator
          const loadingIndicator = document.createElement('div');
          loadingIndicator.className = 'loading-indicator';
          loadingIndicator.style.cssText = `
            padding: 8px 16px;
            background-color: #f8f9fa;
            border-top: 1px solid #e1e4e8;
            color: #666;
            font-size: 12px;
            display: none;
          `;
          loadingIndicator.textContent = 'Processing...';

          panel.appendChild(header);
          panel.appendChild(content);
          panel.appendChild(loadingIndicator);
          document.body.appendChild(panel);
          console.log('New panel created and added to page');
          return true; // Panel was created and shown
        } else {
          console.log('Toggling existing panel');
          // Toggle existing panel
          const isVisible = panel.style.display !== 'none';
          panel.style.display = isVisible ? 'none' : 'flex';
          console.log('Panel visibility set to:', !isVisible);
          return !isVisible; // Return new state
        }
      }
    });

    // Close the popup
    window.close();
  });

  captureBtn.addEventListener('click', async () => {
    console.log('Capture button clicked');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Starting capture for tab:', tab.id);
    
    // First ensure panel is visible
    console.log('Ensuring panel is visible');
    const [{ result: panelReady }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        console.log('Setting up panel for capture');
        let panel = document.querySelector('.ai-assistant-panel');
        if (panel) {
          panel.style.display = 'flex';
          const loadingIndicator = panel.querySelector('.loading-indicator');
          const content = panel.querySelector('.panel-content');
          if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
            console.log('Loading indicator shown');
          }
          if (content) {
            content.innerHTML = '<p>Analyzing page...</p>';
            console.log('Content updated for analysis');
          }
          return true;
        }
        console.log('No panel found for capture');
        return false;
      }
    });
    console.log('Panel ready state:', panelReady);

    // Capture page content
    console.log('Sending CAPTURE_PAGE message to content script');
    chrome.tabs.sendMessage(tab.id, { action: 'CAPTURE_PAGE' }, async (response) => {
      console.log('Received response from content script:', response);
      if (response && response.success) {
        console.log('Sending page data to background script for analysis');
        // Send to background script for API processing
        chrome.runtime.sendMessage(
          { 
            action: 'ANALYZE_PAGE', 
            data: response.data,
            tabId: tab.id  // Pass the tab ID explicitly
          },
          (response) => {
            console.log('Got response from background script:', response);
            if (chrome.runtime.lastError) {
              console.error('Error sending to background script:', chrome.runtime.lastError);
            } else {
              console.log('Successfully sent to background script');
            }
            // Close the popup after sending the message
            window.close();
          }
        );
      } else {
        console.error('Failed to capture page content');
      }
    });
  });

  // Listen for button text update messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in popup:', request);
    if (request.action === 'UPDATE_BUTTON') {
      toggleBtn.textContent = request.isVisible ? 'Hide Panel' : 'Show Panel';
      console.log('Updated button text to:', toggleBtn.textContent);
    }
  });

  console.log('Popup event handlers registered');
}); 