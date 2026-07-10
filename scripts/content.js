// Content Script for Intercom Chat Summarizer

// List of selectors for Intercom Chat Pane
const CHAT_CONTAINER_SELECTORS = [
  '[data-testid="conversation-pane"]',
  '.conversation-pane',
  '.conversation-scrollable',
  '.conversation__messages',
  '.im-conversation-messages-list',
  '.conversation__history',
  '.conversation-scroller'
];

// List of selectors for Intercom Sidebar (contains session IDs, SKU, candidate info, etc.)
const SIDEBAR_SELECTORS = [
  '[data-testid="conversation-sidebar"]',
  '.conversation-sidebar',
  '.sidebar',
  '[data-testid="attribute-list"]',
  '.right-sidebar',
  '.user-profile-sidebar'
];

/**
 * Finds the scrollable chat container.
 * Uses known selectors first, then falls back to locating a scrollable element
 * in the center/right of the workspace.
 */
function findChatContainer() {
  for (const selector of CHAT_CONTAINER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  // Fallback: find any scrollable div with a reasonable height/width
  const divs = Array.from(document.querySelectorAll('div'));
  const scrollables = divs.filter(div => {
    const style = window.getComputedStyle(div);
    const hasScroll = (style.overflowY === 'auto' || style.overflowY === 'scroll');
    const isVisible = div.scrollHeight > div.clientHeight && div.clientHeight > 200 && div.clientWidth > 300;
    return hasScroll && isVisible;
  });

  if (scrollables.length > 0) {
    // Prefer scrollables closer to the center/right of the screen (excluding left sidebar)
    return scrollables.reduce((best, current) => {
      const currentRect = current.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      
      // If current is more to the right, prefer it
      if (currentRect.left > bestRect.left && current.innerText.length > 50) {
        return current;
      }
      return current.innerText.length > best.innerText.length ? current : best;
    }, scrollables[0]);
  }

  return null;
}

/**
 * Finds the right sidebar panel (containing user/session details).
 */
function findRightSidebar() {
  for (const selector of SIDEBAR_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  // Fallback: find a panel on the right side of the screen
  const divs = Array.from(document.querySelectorAll('div'));
  const rightPanels = divs.filter(div => {
    const rect = div.getBoundingClientRect();
    const isRightSide = rect.left > window.innerWidth * 0.5;
    const isBigEnough = rect.width > 200 && rect.height > window.innerHeight * 0.4;
    return isRightSide && isBigEnough;
  });

  if (rightPanels.length > 0) {
    return rightPanels.reduce((best, current) => {
      return current.innerText.length > best.innerText.length ? current : best;
    }, rightPanels[0]);
  }

  return null;
}

/**
 * Scrolls the chat container to the top iteratively to load lazy-loaded messages.
 * Optimized for long chats and slower network pagination speeds.
 */
async function scrollChatToTop(container) {
  return new Promise((resolve) => {
    let lastScrollHeight = container.scrollHeight;
    let sameHeightCount = 0;
    let maxAttempts = 60; // Support extremely long chats (up to 60 lazy-load pages!)
    let attempts = 0;

    const timer = setInterval(() => {
      container.scrollTop = 0; // Scroll up
      attempts++;

      setTimeout(() => {
        const currentScrollHeight = container.scrollHeight;
        
        if (currentScrollHeight === lastScrollHeight) {
          sameHeightCount++;
          // Require 5 consecutive ticks with no height change to ensure true top (prevents early stopping on slow network responses)
          if (sameHeightCount >= 5 || attempts >= maxAttempts) {
            clearInterval(timer);
            resolve();
          }
        } else {
          sameHeightCount = 0;
          lastScrollHeight = currentScrollHeight;
        }
      }, 400); // 400ms check delay after scroll
    }, 700); // 700ms scroll intervals to allow React/network fetching to catch up
  });
}

// Main listener to handle messages from popup/background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'extractChat') {
    (async () => {
      try {
        const container = findChatContainer();
        if (!container) {
          sendResponse({ success: false, error: 'Could not find the conversation chat pane. Please make sure you are viewing an active Intercom conversation.' });
          return;
        }

        // 1. Scroll to the top to ensure all messages are loaded
        await scrollChatToTop(container);

        // 2. Extract chat text (retaining formatting, timestamps, senders)
        const chatText = container.innerText;

        // 3. Extract sidebar details if available
        const sidebar = findRightSidebar();
        const sidebarText = sidebar ? sidebar.innerText : '';

        // 4. Fallback search of general body text for session IDs or SKU
        const bodyText = document.body.innerText;

        sendResponse({
          success: true,
          chatText: chatText,
          sidebarText: sidebarText,
          bodyText: bodyText
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
