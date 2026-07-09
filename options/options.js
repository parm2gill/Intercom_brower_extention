document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  const storage = typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : browser.storage.local;

  // Load saved settings
  storage.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      let model = result.geminiModel;
      if (model === 'gemini-2.5-flash' || model === 'gemini-1.5-flash') {
        model = 'gemini-3.5-flash';
      } else if (model === 'gemini-1.5-pro') {
        model = 'gemini-3.5-pro';
      }
      modelSelect.value = model;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!apiKey) {
      showStatus('Please enter an API key.', 'error');
      return;
    }

    storage.set({
      geminiApiKey: apiKey,
      geminiModel: model
    }, () => {
      showStatus('Settings saved successfully!', 'success');
    });
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
});
