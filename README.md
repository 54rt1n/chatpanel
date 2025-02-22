# Webpage Capture Assistant

A Chrome/Brave extension that captures webpage content and sends it to a chat completions API (e.g., OpenAI) for analysis.

## Features

- Captures current webpage content (text and URL)
- Sends captured content to OpenAI's chat completions API
- Displays AI-generated analysis in a clean popup interface
- Secure API key storage
- Modern, user-friendly interface

## Installation

### Developer Mode (Local Installation)

1. Clone or download this repository
2. Open Chrome/Brave and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension icon should appear in your browser toolbar

### Configuration

1. Click the extension icon in your toolbar
2. Click the gear icon or right-click and select "Options"
3. Enter your OpenAI API key
4. Click "Save"

## Usage

1. Navigate to any webpage you want to analyze
2. Click the extension icon in your toolbar
3. Click "Capture & Analyze Page"
4. Wait for the analysis to complete
5. View the AI-generated analysis in the popup

## Security

- API keys are stored securely in Chrome's local storage
- No data is stored permanently
- All communication with the API is done via HTTPS
- Content script only accesses publicly visible page content

## Development

### Project Structure

```
├── manifest.json           # Extension configuration
├── background.js          # Service worker for API communication
├── content-script.js      # Page content capture
├── popup.html            # Extension popup interface
├── popup.js             # Popup functionality
├── options.html         # Settings page
└── options.js          # Settings functionality
```

### Building from Source

1. Make sure you have Node.js installed
2. Clone the repository
3. Install dependencies (if any)
4. Load the extension in developer mode

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - feel free to use this code for any purpose.

## Support

For issues, questions, or contributions, please open an issue in the repository.

## Privacy Policy

This extension:
- Only captures content from the active tab when explicitly requested
- Does not store any captured content permanently
- Only communicates with the configured API endpoint
- Does not track user behavior or collect analytics 