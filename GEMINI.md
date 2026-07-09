# Intercom Chat Summarizer - Project Guidance

This document outlines the architecture, standards, and conventions for the Intercom Chat Summarizer Extension.

## 🏗️ Architecture & Stack
- **Extension Standard**: Manifest V3 (compatible with both Firefox and Google Chrome).
- **Core APIs**: `chrome.storage.local`, `chrome.scripting`, `chrome.runtime`, and `chrome.tabs`.
- **Background Operations**: Handled by a modern, non-persistent service worker `scripts/background.js`.
- **DOM Scraper**: Custom scraping logic in `scripts/content.js` to programmatically scroll and capture the lazy-loaded message stream.
- **LLM Integration**: Direct secure integration with Google Gemini API via background script.

## 📝 Conventions & Style
- **Cross-Browser Compatibility**: Always use standard, cross-compatible `chrome.*` APIs (e.g., `chrome.runtime.onMessage`) rather than Firefox-only `browser.*` where possible, or fall back dynamically:
  ```javascript
  const storage = typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : browser.storage.local;
  ```
- **Error Handling**: Every API response must explicitly handle runtime errors (such as missing API keys, failed fetch, or DOM elements not found).
- **Security**: Never expose, log, or commit the Gemini API key. Use local storage to keep it private on the user's browser.

## 🎯 Target Plaintext Summary Format
The Gemini model is instructed to output clean plaintext with no markdown bolding (`**`) using this structure:
```text
Session ID: [UUID Session ID] (Koala [numeric code])
SKU: [SKU code]

Issue: [1-sentence description of the issue]

Action: [1-2 sentences on action taken by support]

Resolution: [1-sentence description of final resolution]
```
