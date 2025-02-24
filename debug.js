import logger from './logger.js';

const logsContainer = document.getElementById('logs');
const logLevelSelect = document.getElementById('logLevel');
const clearButton = document.getElementById('clear');
const exportButton = document.getElementById('export');
const autoScrollCheckbox = document.getElementById('autoScroll');

// Function to format a log entry
function formatLogEntry(log) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = log.timestamp;
    
    const level = document.createElement('span');
    level.className = `level ${log.level}`;
    level.textContent = log.level;
    
    const message = document.createElement('span');
    message.className = 'message';
    message.textContent = log.message.map(msg => {
        if (typeof msg === 'string') return msg;
        return JSON.stringify(msg, null, 2);
    }).join(' ');
    
    entry.appendChild(timestamp);
    entry.appendChild(level);
    entry.appendChild(message);
    
    return entry;
}

// Function to update the logs display
function updateLogs() {
    const logs = logger.getLogs();
    const selectedLevel = logLevelSelect.value;
    const levelValue = logger.levels[selectedLevel];
    
    // Clear current display
    logsContainer.innerHTML = '';
    
    // Filter and display logs
    logs.filter(log => logger.levels[log.level] >= levelValue)
        .forEach(log => {
            logsContainer.appendChild(formatLogEntry(log));
        });
    
    // Auto-scroll if enabled
    if (autoScrollCheckbox.checked) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
}

// Event listeners
logLevelSelect.addEventListener('change', updateLogs);

clearButton.addEventListener('click', () => {
    logger.clearLogs();
    updateLogs();
});

exportButton.addEventListener('click', () => {
    const logs = logger.exportLogs();
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extension-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Update logs initially
updateLogs();

// Set up periodic refresh
setInterval(updateLogs, 1000); 