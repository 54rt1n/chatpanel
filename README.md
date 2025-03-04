# Webpage Capture Assistant

A Chrome/Brave extension that captures webpage content and sends it to a extended chat completions API (e.g., AI Mind) for analysis. This extension supports multiple AI agents, each with their own persistent conversation threads.

## Features

- Analyze webpages with AI assistance
- Multiple configurable AI agents with different personalities and settings
- Persistent conversation history
- Chat panel that overlays on any webpage
- Support for different LLM providers (via API endpoint configuration)
- Agent-specific conversation history

## Development Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone [repository-url]
   cd webpage-capture-assistant
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the extension:
   ```
   npm run build
   ```

4. For development with auto-rebuild:
   ```
   npm run dev
   ```

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `dist` directory from this project
4. The extension icon should now appear in your browser toolbar

## Project Structure

```
web-capture-assistant/
├── src/
│   ├── background/        # Background service worker
│   ├── content/           # Content scripts
│   ├── popup/             # Extension popup
│   ├── options/           # Options page
│   ├── history/           # Conversation history page
│   ├── shared/            # Shared modules
│   └── manifest.json      # Extension manifest
├── dist/                  # Compiled extension output
├── webpack.config.js      # Webpack configuration
└── package.json           # NPM package definition
```

## Configuration

The extension requires an API endpoint that follows the OpenAI chat completions API format.

1. Click the extension icon and select "Options"
2. Enter your API endpoint and API key
3. Configure agents with different personalities and settings

## Using the Extension

1. Click the extension icon while on any webpage
2. Select "Analyze This Page" to get an AI analysis
3. Or select "Open Chat Panel" to start a conversation
4. Use the agent tabs in the panel to switch between different AI personas

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.