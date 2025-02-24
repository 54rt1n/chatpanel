import logger from './logger.js';

class API {
    constructor() {
        // Initialize with default values - remove trailing slash
        this.apiEndpoint = 'http://localhost:8000';
        this.apiKey = null;
        logger.info('API class initialized');
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
        
        logger.info('API initialized with endpoint:', this.apiEndpoint);
    }

    async fetch(path, options = {}) {
        await this.initialize();

        // Ensure path starts with slash
        const normalizedPath = path.startsWith('/') ? path : '/' + path;
        const url = `${this.apiEndpoint}${normalizedPath}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...options.headers
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
                logger.warn('Could not read response body for logging:', e);
            }
            
            logger.logAPIResponse(url, response, responseBody);

            return response;
        } catch (error) {
            logger.error('API request failed:', error);
            throw error;
        }
    }

    async chatCompletion(messages, metadata = {}) {
        logger.info('Starting chat completion request');
        logger.debug('Chat completion params:', { messages, metadata });

        try {
            // TODO
            const response = await this.fetch('v1/chat/completions', {
                method: 'POST',
                body: JSON.stringify({
                    messages,
                    metadata,
                    model: metadata.model || 'gpt-3.5-turbo',
                    temperature: metadata.temperature || 0.7,
                    stream: metadata.stream !== undefined ? metadata.stream : true,
                    ...metadata
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                logger.error('Chat completion failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
            }

            logger.info('Chat completion request successful');
            return response;
        } catch (error) {
            logger.error('Chat completion error:', error);
            throw error;
        }
    }

    async saveConversation(conversationId, messages) {
        logger.info('Saving conversation:', conversationId);
        logger.debug('Conversation messages:', messages);

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
                logger.error('Save conversation failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`Failed to save conversation: ${response.statusText} - ${errorText}`);
            }

            logger.info('Conversation saved successfully');
            return response.json();
        } catch (error) {
            logger.error('Save conversation error:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const api = new API();
export default api; 