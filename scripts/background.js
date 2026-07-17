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
        // Default to gemini-3.5-flash if not configured. Migrate older deprecated models.
        let model = settings.geminiModel || 'gemini-3.5-flash';
        if (model === 'gemini-2.5-flash' || model === 'gemini-1.5-flash') {
          model = 'gemini-3.5-flash';
        } else if (model === 'gemini-1.5-pro') {
          model = 'gemini-3.5-pro';
        }

        if (!apiKey) {
          throw new Error('Gemini API key is not configured. Please open Settings.');
        }

        // 4. Construct prompt for Gemini
        const systemPrompt = `You are an extremely accurate support assistant summarizing technical chat transcripts on Intercom.

The chats are between:
1. The Proctor (or Examiner) - the user on the chat contacting support.
2. The Support Agent - the agent replying on behalf of support.
Note: The Proctor is contacting support on behalf of a Candidate who is currently taking the exam. The candidate is the one who ran into the issue and reported it to the proctor, and the proctor is simply initiating the chat to relay the candidate's issue to support.

Your task is to thoroughly read the entire provided chat transcript, along with sidebar and page metadata text, to generate a precise, completely honest summary in the EXACT format specified below.

DO NOT use markdown bold formatting (like "**") for the headers (Session ID, SKU, Issue, Action, Resolution). Keep them as clean plaintext. Do not add any conversational preambles or postambles.

REQUIRED SUMMARY FORMAT:
Session ID: [UUID Session ID] [Include "(Koala [numeric code])" ONLY if a Koala ID is found in the chat or metadata. If Koala is not found, do not output any Koala segment.]
[Include "SKU: [SKU code]" line ONLY if a SKU is found in the chat or metadata. If SKU is not found, omit the entire SKU line from the summary.]

Issue: [Provide a concise, clear description of the exam task or environment issue that the candidate faced and reported to the proctor (which the proctor then relayed to support). Always frame the issue as being reported/faced by the candidate, not by the proctor.]

Action: [Provide a comprehensive description of the actual actions taken by support during the chat. The length should depend on the complexity of the chat and must not be restricted to 1-2 lines. Describe exactly what support did, step-by-step. If support declined to assist (e.g., because of exam policy on exam content queries, directing that the candidate must figure it out on their own), clearly state this. Never assume, imply, or hallucinate backend checks, wiki-lookups, or troubleshooting steps unless they are explicitly and literally written in the chat transcript.]

Resolution: [Provide a detailed description of the final outcome and how the issue itself was concluded based STRICTLY on the transcript. Do not restrict this to a fixed number of lines. Focus entirely on the final technical state or decision (e.g., support declined assistance because candidates must figure exam tasks out themselves, or the environment was verified as fine). OMIT trivial social pleasantries or concluding exchanges such as thanking, saying goodbye, or welcoming each other (e.g., do NOT mention "proctor thanked agent" or "agent welcomed proctor").]

GUIDELINES FOR EXTRACTION:
1. Session ID: Look for a 36-character UUID (e.g. 77971dc2-2eb7-4581-876d-cadc75637868) in the chat metadata, sidebar text, or body text. If not found, write "Session ID: Not Found".
2. SKU: Look for standard codes starting with "EX" followed by digits and optionally letters (e.g. EX188V4K, EX200, EX300, EX200V10K). If no SKU is found anywhere, omit the SKU line completely from the final output.
3. Koala: Look for "Koala" followed by any numeric code (e.g. 2122, 1000) in the sidebar or page metadata. If no Koala ID is found, do not output any Koala text (e.g., do not output "(Koala Unknown)").
4. Do not make up fake IDs or use placeholders like "Unknown" or "Not Found" for SKU and Koala; simply omit them from the final text if they are not explicitly present.
5. Keep descriptions highly direct, objective, and technical. Do not speculate or extrapolate beyond what is documented in the text.
6. Read the full chat thoroughly from beginning to end to ensure nothing is missed or misrepresented. Always correctly attribute the initial issue to the candidate (relayed by the proctor) and avoid trivial greeting/thanking details in the resolution. Apply whatever actually happened in the chat into the summary.
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
