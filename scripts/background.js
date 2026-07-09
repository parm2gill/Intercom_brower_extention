// Background Script for Intercom Chat Summarizer

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Dynamically injects the content script into the specified tab if not already present.
 */
async function injectContentScript(tabId) {
  try {
    // Send a quick ping to see if the content script is already active
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          reject(new Error('Content script not active'));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    // Script not active, inject it
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['scripts/content.js']
    });
  }
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarizeChat') {
    const tabId = request.tabId;

    (async () => {
      try {
        // 1. Ensure content script is injected
        await injectContentScript(tabId);

        // 2. Extract chat details from the content script
        const extraction = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: 'extractChat' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response || !response.success) {
              reject(new Error(response ? response.error : 'Failed to extract chat.'));
            } else {
              resolve(response);
            }
          });
        });

        const { chatText, sidebarText, bodyText } = extraction;

        // 3. Get Gemini settings from storage
        const settings = await new Promise((resolve) => {
          chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (result) => {
            resolve(result);
          });
        });

        const apiKey = settings.geminiApiKey;
        // Default to gemini-2.5-flash if not configured
        const model = settings.geminiModel || 'gemini-2.5-flash';

        if (!apiKey) {
          throw new Error('Gemini API key is not configured. Please open Settings.');
        }

        // 4. Construct prompt for Gemini
        const systemPrompt = `You are a highly efficient support assistant summarizing technical chat transcripts between exam proctors/examiners and support agents on Intercom.

Your task is to analyze the provided chat transcript, along with sidebar and page metadata text, to generate a highly concise summary in the EXACT format specified below.

DO NOT use markdown bold formatting (like "**") for the headers (Session ID, SKU, Issue, Action, Resolution). Keep them as clean plaintext. Do not add any conversational preambles or postambles.

REQUIRED SUMMARY FORMAT:
Session ID: [UUID Session ID] (Koala [numeric code, e.g., 2122])
SKU: [SKU code, e.g., EX188V4K]

Issue: [Provide a 1-sentence description of the issue reported by the proctor]

Action: [Provide a 1-2 sentence description of the actions taken by support, including checking backend status, applying standard wiki articles/steps to sync application, or UI refreshes if mentioned or strongly implied by standard support protocols]

Resolution: [Provide a 1-sentence description of how the issue was resolved and how the chat concluded]

GUIDELINES FOR EXTRACTION:
1. Session ID: Look for a 36-character UUID (e.g. 77971dc2-2eb7-4581-876d-cadc75637868) in the chat metadata, sidebar text, or body text.
2. SKU: Look for standard codes starting with "EX" followed by digits and optionally letters (e.g. EX188V4K, EX200, EX300).
3. Koala: Look for "Koala" followed by a 3 or 4-digit code (e.g. 2122) in the sidebar or page metadata.
4. If SKU, Session ID, or Koala cannot be found, output "Not Found" or "Unknown" for that field. Do not make up fake IDs.
5. Keep descriptions highly direct and technical. Translate proctor's casual explanations into clear technical summaries.
`;

        const userContent = `Here is the extracted conversation data:

--- CONVERSATION CHAT HISTROY ---
${chatText}

--- SIDEBAR PANEL METADATA ---
${sidebarText}

--- GENERAL PAGE CONTENT ---
${bodyText}
`;

        // 5. Query Gemini API
        const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt + "\n\n" + userContent }]
              }
            ],
            generationConfig: {
              temperature: 0.1 // Low temperature for highly consistent and structured output
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || `API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!summary) {
          throw new Error('Gemini API returned an empty response.');
        }

        sendResponse({ success: true, summary: summary.trim() });

      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open for async response
  }
});
