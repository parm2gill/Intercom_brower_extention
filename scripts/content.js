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
 * Optimized for long chats, slow network pagination speeds, and fast-resolve on short chats.
 */
async function scrollChatToTop(container) {
  return new Promise((resolve) => {
    // If there's no scrollbar, we are already at the top
    if (container.scrollHeight <= container.clientHeight) {
      resolve();
      return;
    }

    // Check if container is already scrolled near the top when starting
    const startedAtTop = container.scrollTop <= 5;

    let lastScrollHeight = container.scrollHeight;
    let sameHeightCount = 0;
    let maxAttempts = 60; // Support extremely long chats
    let attempts = 0;

    const timer = setInterval(() => {
      container.scrollTop = 0; // Scroll up
      attempts++;

      setTimeout(() => {
        const currentScrollHeight = container.scrollHeight;
        
        if (currentScrollHeight === lastScrollHeight) {
          sameHeightCount++;
          // Dynamic limit: If we started already at the top, resolve quickly (2 ticks = 1.4s)
          // Otherwise, give slow network paginations ample time to load (7 ticks = 4.9s)
          const limit = startedAtTop ? 2 : 7;
          
          if (sameHeightCount >= limit || attempts >= maxAttempts) {
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

/**
 * Chronologically extracts currently visible message objects from the DOM with metadata and timestamps.
 */
function getVisibleMessages(container) {
  const results = [];
  
  // 1. Query potential message elements (avoiding broad outer layout wrappers)
  let messageBlocks = Array.from(container.querySelectorAll(
    '[data-testid="conversation-part"], [data-testid="admin-message-part"], [data-testid="customer-message-part"], ' +
    '.conversation-part, .conversation-part__container, .conversation-part__body, .im-message-body, ' +
    '[class*="conversation-part"], [class*="message-part"], [class*="message-body"], ' +
    'div[class*="bubble"], div[class*="message-text"], span[class*="message-text"]'
  ));
  
  // 2. Filter down to elements that actually contain text
  messageBlocks = messageBlocks.filter(el => {
    const txt = el.innerText ? el.innerText.trim() : '';
    return txt.length > 0 && txt.length < 2000; // exclude full wrapper containers
  });

  // 3. Filter out parent elements to keep only the leaf-most message nodes (prevents duplicate bubbles)
  messageBlocks = messageBlocks.filter(el => {
    return !messageBlocks.some(other => other !== el && el.contains(other));
  });

  // 4. Fallback if empty: use direct children containing text
  if (messageBlocks.length === 0) {
    messageBlocks = Array.from(container.children).filter(el => {
      const txt = el.innerText ? el.innerText.trim() : '';
      return txt.length > 0;
    });
  }
  
  messageBlocks.forEach((block) => {
    let text = block.innerText ? block.innerText.trim() : '';
    if (!text || text.includes('Exclude from CSAT')) return;

    // Determine Sender Type (Support vs Proctor/Customer)
    let senderType = 'Customer';
    let timestamp = '';
    
    let current = block;
    while (current && current !== container) {
      const classList = current.className || '';
      const dataTestId = current.getAttribute('data-testid') || '';
      
      if (typeof classList === 'string') {
        const lowerClass = classList.toLowerCase();
        
        // Admin/Agent/Support Detection
        if (
          lowerClass.includes('admin') || 
          lowerClass.includes('agent') || 
          lowerClass.includes('operator') ||
          lowerClass.includes('you') ||
          lowerClass.includes('right') ||
          lowerClass.includes('end') ||
          lowerClass.includes('creator-admin') ||
          dataTestId.includes('admin') || 
          dataTestId.includes('agent') || 
          current.querySelector('.conversation-part__metadata--admin') !== null ||
          current.querySelector('[class*="admin"]') !== null ||
          current.querySelector('[class*="agent"]') !== null
        ) {
          senderType = 'Support';
          break; // Confirmed agent
        } 
      }

      // Visual/Style layout alignment check (agent messages are aligned to the right/flex-end)
      try {
        const style = window.getComputedStyle(current);
        if (
          style.alignSelf === 'flex-end' || 
          style.justifyContent === 'flex-end' || 
          style.float === 'right' ||
          style.textAlign === 'right' ||
          parseInt(style.marginLeft, 10) > 100
        ) {
          senderType = 'Support';
          break;
        }
      } catch (e) {
        // ignore
      }
      
      const timeElement = current.querySelector('time, .conversation-part__time, .conversation-part__metadata');
      if (timeElement && !timestamp) {
        timestamp = timeElement.getAttribute('datetime') || timeElement.getAttribute('title') || timeElement.innerText || '';
      }
      
      current = current.parentElement;
    }

    if (!timestamp) {
      const titledEl = block.querySelector('[title]');
      if (titledEl) {
        timestamp = titledEl.getAttribute('title') || '';
      }
    }

    // Default timestamp parsing clean up
    let timeText = timestamp ? timestamp.trim() : '';

    results.push({
      sender: senderType,
      text: text,
      timeText: timeText
    });
  });

  return results;
}

/**
 * Handles lazy-loading by scrolling to top, then scrolling down step-by-step
 * to capture and deduplicate all messages (even in virtualized scroll containers).
 */
async function scrollAndCaptureChat(container) {
  // 1. Scroll to top to ensure all history is fully fetched and lazy-loaded
  await scrollChatToTop(container);

  // 2. We are now at the top. Let's scroll down step-by-step and capture messages.
  const messagesMap = new Map();

  function capture() {
    const visible = getVisibleMessages(container);
    visible.forEach(msg => {
      // Normalize whitespace for reliable deduplication
      const normalizedText = msg.text.replace(/\s+/g, ' ');
      // Key is composed of sender, text, and timestamp/timetext to avoid collapsing identical texts sent at different times
      const key = `${msg.sender}||${normalizedText}||${msg.timeText}`;
      
      if (!messagesMap.has(key)) {
        messagesMap.set(key, {
          sender: msg.sender,
          text: msg.text,
          timeText: msg.timeText,
          order: messagesMap.size
        });
      }
    });
  }

  // Initial capture at the top
  capture();

  // Scroll down step-by-step in increments of 40% of the viewport height (generous overlap)
  const step = Math.max(200, Math.floor(container.clientHeight * 0.4));
  let currentScroll = 0;
  let sameBottomCount = 0;

  while (sameBottomCount < 5) {
    const previousScroll = container.scrollTop;
    currentScroll = previousScroll + step;
    container.scrollTop = currentScroll;

    // Wait 180ms for browser rendering/react cycle to fully mount and paint visible DOM nodes
    await new Promise(r => setTimeout(r, 180));
    capture();

    if (container.scrollTop === previousScroll) {
      sameBottomCount++;
    } else {
      sameBottomCount = 0;
    }

    // Safeguard: don't loop forever if scrollHeight is infinite
    if (currentScroll > container.scrollHeight + 10000) {
      break;
    }
  }

  // Ensure we reach the absolute bottom at the end and capture one last time
  container.scrollTop = container.scrollHeight;
  await new Promise(r => setTimeout(r, 150));
  capture();

  // Sort messages in order of first discovery (which is perfect top-to-bottom chronological order)
  const sorted = Array.from(messagesMap.values()).sort((a, b) => a.order - b.order);

  // Format into a single cleanly structured chat history string
  const formattedChatText = sorted.map(m => {
    const timeStr = m.timeText ? ` [${m.timeText}]` : '';
    return `${m.sender}${timeStr}: ${m.text}`;
  }).join('\n\n');

  return formattedChatText;
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

        // 1. Scroll and capture all messages (handles lazy-loading and virtualization)
        const chatText = await scrollAndCaptureChat(container);

        // 2. Extract sidebar details if available
        const sidebar = findRightSidebar();
        const sidebarText = sidebar ? sidebar.innerText : '';

        // 3. Fallback search of general body text for session IDs or SKU
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
