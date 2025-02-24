class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // Keep last 1000 logs
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        this.level = this.levels.DEBUG; // Default to most verbose
        this.loadLogsFromStorage(); // Load logs when initializing
        
        // Setup debounced persist
        this.persistDebounceTimeout = null;
        this.PERSIST_DELAY = 1000; // Persist at most once per second
    }

    _log(level, ...args) {
        const timestamp = new Date().toISOString();
        const seen = new Set(); // Initialize Set for tracking circular references
        const logEntry = {
            timestamp,
            level,
            message: args.map(arg => {
                if (arg instanceof Error) {
                    return {
                        message: arg.message,
                        stack: arg.stack,
                        name: arg.name
                    };
                }
                if (typeof arg === 'object') {
                    try {
                        // Handle circular references
                        return JSON.stringify(arg, (key, value) => {
                            if (key === 'apiKey') return '[HIDDEN]';
                            if (typeof value === 'object' && value !== null) {
                                if (seen.has(value)) return '[Circular]';
                                seen.add(value);
                            }
                            return value;
                        }, 2);
                    } catch (e) {
                        return arg.toString();
                    }
                }
                return arg;
            })
        };

        // Store log
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift(); // Remove oldest log
        }

        // Schedule debounced persist
        this._debouncePersist();

        // Also output to console with appropriate method
        const consoleArgs = [
            `%c${timestamp}%c [${level}]`,
            'color: gray',
            level === 'ERROR' ? 'color: red; font-weight: bold' :
            level === 'WARN' ? 'color: orange' :
            level === 'INFO' ? 'color: blue' : 'color: green',
            ...args
        ];

        switch (level) {
            case 'ERROR':
                console.error(...consoleArgs);
                break;
            case 'WARN':
                console.warn(...consoleArgs);
                break;
            case 'INFO':
                console.info(...consoleArgs);
                break;
            default:
                console.log(...consoleArgs);
        }
    }

    _debouncePersist() {
        if (this.persistDebounceTimeout) {
            clearTimeout(this.persistDebounceTimeout);
        }
        this.persistDebounceTimeout = setTimeout(() => {
            this.persistToStorage();
        }, this.PERSIST_DELAY);
    }

    debug(...args) {
        if (this.level <= this.levels.DEBUG) {
            this._log('DEBUG', ...args);
        }
    }

    info(...args) {
        if (this.level <= this.levels.INFO) {
            this._log('INFO', ...args);
        }
    }

    warn(...args) {
        if (this.level <= this.levels.WARN) {
            this._log('WARN', ...args);
        }
    }

    error(...args) {
        if (this.level <= this.levels.ERROR) {
            // Capture stack trace for all error logs
            const stack = new Error().stack;
            const argsWithStack = [...args, { stack }];
            this._log('ERROR', ...argsWithStack);
        }
    }

    // Log API request
    logAPIRequest(method, url, body) {
        this.debug('API Request:', {
            method,
            url,
            body: this._sanitizeBody(body)
        });
    }

    // Log API response
    logAPIResponse(url, response, body) {
        this.debug('API Response:', {
            url,
            status: response.status,
            statusText: response.statusText,
            body: this._sanitizeBody(body)
        });
    }

    // Helper to sanitize sensitive data
    _sanitizeBody(body) {
        if (!body) return body;
        
        try {
            const sanitized = JSON.parse(JSON.stringify(body));
            if (sanitized.apiKey) sanitized.apiKey = '[HIDDEN]';
            if (sanitized.Authorization) sanitized.Authorization = '[HIDDEN]';
            return sanitized;
        } catch (e) {
            return body;
        }
    }

    // Get all logs
    getLogs() {
        return [...this.logs];
    }

    // Clear logs
    clearLogs() {
        this.logs = [];
        this.persistToStorage(); // Directly persist when clearing
        this.info('Logs cleared');
    }

    // Export logs as JSON
    exportLogs() {
        return JSON.stringify(this.logs, null, 2);
    }

    // Set log level
    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.level = this.levels[level];
        }
    }

    async persistToStorage() {
        try {
            await chrome.storage.local.set({ 'persistedLogs': this.logs });
        } catch (e) {
            console.error('Failed to persist logs to storage:', e);
        }
    }

    async loadLogsFromStorage() {
        try {
            const result = await chrome.storage.local.get('persistedLogs');
            if (result.persistedLogs) {
                this.logs = result.persistedLogs;
                console.log('Loaded logs from storage:', this.logs.length);
            }
        } catch (e) {
            console.error('Failed to load logs from storage:', e);
        }
    }

    // Add system info logging
    logSystemInfo() {
        this.info('System Information', {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            logLevel: this.level,
            maxLogs: this.maxLogs,
            currentLogsCount: this.logs.length
        });
    }

    // Add performance logging
    logPerformance(operation, duration) {
        this.info('Performance Metric', {
            operation,
            duration,
            timestamp: Date.now()
        });
    }

    // Add state change logging
    logStateChange(component, previousState, newState) {
        this.info('State Change', {
            component,
            previousState: this._sanitizeBody(previousState),
            newState: this._sanitizeBody(newState),
            timestamp: Date.now()
        });
    }
}

const logger = new Logger();
export default logger; 