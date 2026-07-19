document.addEventListener('DOMContentLoaded', () => {
  const settingsLink = document.getElementById('settingsLink');
  const warningSettingsLink = document.getElementById('warningSettingsLink');
  const noKeyWarning = document.getElementById('noKeyWarning');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const statusDiv = document.getElementById('status');
  const resultText = document.getElementById('resultText');
  const copyBtn = document.getElementById('copyBtn');

  const storage = typeof chrome !== 'undefined' && chrome.storage ? (chrome.storage.sync || chrome.storage.local) : (browser.storage.sync || browser.storage.local);
  const runtime = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : browser.runtime;
  const tabs = typeof chrome !== 'undefined' && chrome.tabs ? chrome.tabs : browser.tabs;

  // Open settings page
  const openSettings = (e) => {
    e.preventDefault();
    if (runtime.openOptionsPage) {
      runtime.openOptionsPage();
    } else {
      window.open(runtime.getURL('options/options.html'));
    }
  };

  settingsLink.addEventListener('click', openSettings);
  warningSettingsLink.addEventListener('click', openSettings);

  // Check API Key
  storage.get(['geminiApiKey'], (result) => {
    if (!result.geminiApiKey) {
      noKeyWarning.style.display = 'block';
      summarizeBtn.disabled = true;
    }
  });

  // Summarize action
  summarizeBtn.addEventListener('click', async () => {
    statusDiv.textContent = 'Analyzing page...';
    statusDiv.style.color = '#495057';
    summarizeBtn.disabled = true;
    resultText.value = '';
    copyBtn.disabled = true;

    try {
      const [tab] = await tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found.');
      }

      if (!tab.url || !tab.url.includes('intercom.com')) {
        throw new Error('This extension only works on intercom.com.');
      }

      statusDiv.textContent = 'Scrolling and extracting chat...';

      // Send message to background script to orchestrate everything
      runtime.sendMessage({ action: 'summarizeChat', tabId: tab.id }, (response) => {
        if (runtime.lastError) {
          showError(runtime.lastError.message);
          return;
        }

        if (!response) {
          showError('No response received from background script.');
          return;
        }

        if (response.success) {
          statusDiv.textContent = 'Summary generated!';
          statusDiv.style.color = '#2b8a3e';
          resultText.value = response.summary;
          copyBtn.disabled = false;
        } else {
          showError(response.error || 'An unknown error occurred.');
        }
        summarizeBtn.disabled = false;
      });

    } catch (err) {
      showError(err.message);
      summarizeBtn.disabled = false;
    }
  });

  // Copy action
  copyBtn.addEventListener('click', () => {
    resultText.select();
    document.execCommand('copy');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  });

  function showError(msg) {
    statusDiv.textContent = `Error: ${msg}`;
    statusDiv.style.color = '#c92a2a';
  }
});
