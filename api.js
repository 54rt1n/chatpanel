class API {
    constructor() {
        // Initialize with default values - remove trailing slash
        this.apiEndpoint = 'http://localhost:8000';
        this.apiKey = null;
        console.info('API class initialized');
    }

    async initialize() {
        logger.debug('Initializing API...');
        // Load settings from chrome storage
        const settings = await chrome.storage.local.get(['apiKey', 'apiEndpoint']);
        // Remove trailing slash if present
        this.apiEndpoint = (settings.apiEndpoint || this.apiEndpoint).replace(/\/$/, '');
        this.apiKey = settings.apiKey;

        if (!this.apiKey) {
            logger.error('API key not found');
            throw new Error('API key not found. Please set it in the options page.');
        }
        
        console.info('API initialized with endpoint:', this.apiEndpoint);
    }

    async fetch(path, options = {}) {
        await this.initialize();

        // Ensure path starts with slash
        const normalizedPath = path.startsWith('/') ? path : '/' + path;
        const url = `${this.apiEndpoint}${normalizedPath}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...(options.headers || {})  // Merge headers from options
        };

        const requestOptions = {
            ...options,
            headers
        };

        logger.logAPIRequest(requestOptions.method || 'GET', url, requestOptions.body);

        try {
            const response = await fetch(url, requestOptions);
            
            // Clone response for logging since it can only be read once
            const responseClone = response.clone();
            let responseBody;
            try {
                responseBody = await responseClone.text();
            } catch (e) {
                console.warn('Could not read response body for logging:', e);
            }
            
            console.log('API response:', { url, response, responseBody });

            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async saveConversation(conversationId, messages) {
        console.info('Saving conversation:', conversationId);
        console.debug('Conversation messages:', messages);

        try {
            const response = await this.fetch('api/conversation', {
                method: 'POST',
                body: JSON.stringify({
                    conversation_id: conversationId,
                    messages,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('Save conversation failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`Failed to save conversation: ${response.statusText} - ${errorText}`);
            }

            console.info('Conversation saved successfully');
            return response.json();
        } catch (error) {
            console.error('Save conversation error:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const api = new API();
export default api; 