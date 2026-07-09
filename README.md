# Intercom Chat Summarizer Extension (Firefox & Google Chrome)

A WebExtensions (Manifest V3) browser extension for Firefox and Google Chrome designed to extract chat histories from `enterprise.app.intercom.com`, handle lazy-loaded messaging lists by automatically scrolling, and generate clean, formatted summaries using the Google Gemini API.

---

## 📋 Features

- **Automated Scrolling**: Smoothly scrolls the Intercom conversation pane to load long chat histories.
- **Smart Metadata Scraper**: Detects Session IDs (UUIDs), exam SKUs (like `EX188V4K`), candidate usernames, and Koala codes from the page text and sidebar.
- **Google Gemini Integration**: Uses Gemini Models (e.g. `gemini-2.5-flash` or `gemini-1.5-pro`) to summarize conversations.
- **Strict Target Layout**: Produces clean summaries following a specific plaintext template:
  ```text
  Session ID: 77971dc2-2eb7-4581-876d-cadc75637868 (Koala 2122)
  SKU: EX188V4K

  Issue: Proctor reported the exam status was stuck on "Setting up" 11 minutes before the start time.

  Action: Verified that the back-end server and Gumtree status were already marked "Ready." Applied the standard troubleshooting steps from the cert-wiki article to sync the app UI.

  Resolution: The proctor confirmed the status updated to "Ready." Concluded the chat.
  ```
- **Quick Copy**: Click "Copy Summary" to quickly save it to your clipboard.

---

## 🛠️ How to Install (For Development / Testing)

Since this extension is unpacked, you can load it temporarily in your browser:

### For Google Chrome
1. Download or clone this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `intercom-summarizer` folder (containing `manifest.json`).

### For Firefox
1. Download or clone this repository to your local machine.
2. Open Firefox and navigate to `about:debugging`.
3. Click on **This Firefox** in the left menu.
4. Click the **Load Temporary Add-on...** button.
5. Select the **`manifest.json`** file inside this folder.

*Note: In Firefox, temporary add-ons are removed when Firefox restarts. To share permanently with your team, see the **Team Sharing** section below.*

---

## 🔑 How the API Key Works

The extension saves your settings securely using Firefox's `storage.local` API, which runs independently on each user's browser.

### Option A: Each Team Member Generates Their Own Key (Recommended)
1. Each team member goes to the [Google AI Studio](https://aistudio.google.com/) and generates a free API key.
2. Open the extension popup, click **⚙️ Settings**, paste their key, and click **Save Settings**.
3. **Benefits**: Completely free, individual rate limits, no shared cost.

### Option B: Share a Single Team API Key
1. Generate one Gemini API key from your Google Cloud / AI Studio account.
2. Share this key securely with your team members (e.g., via a password manager).
3. Every team member pastes the *same* key into their extension's Settings page.
4. **Benefits**: Team members don't need to sign up for accounts; **Drawback**: They will share the same rate-limiting quota and billing (if using a paid tier).

---

## 🚀 How to Share with Your Team Permanently

To distribute this extension so your team doesn't have to reload it every time Firefox restarts:

### Method 1: Self-Distribution (Signed `.xpi` File)
Firefox requires extensions to be signed by Mozilla to run permanently.
1. Create a developer account on the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Submit your extension as **"On your own" (Self-Distribution / Self-Hosted)**.
3. Mozilla will automatically scan and sign your extension.
4. Download the signed `.xpi` file.
5. Send the `.xpi` file to your team. They can drag-and-drop the `.xpi` file directly into Firefox to install it permanently!

### Method 2: Use Firefox Developer Edition or Nightly
If your team uses Firefox Developer Edition, Firefox Nightly, or Firefox ESR:
1. Type `about:config` in the address bar.
2. Search for `xpinstall.signatures.required` and set it to `false`.
3. You can now zip the folder, change the extension from `.zip` to `.xpi`, and install it permanently without signing.

---

## 💻 Technical Architecture

- `manifest.json`: Configuration, dynamic content-script injection, and permissions setup.
- `popup/`: User interface for summarizing, monitoring extraction status, and displaying output.
- `options/`: Configuration manager for the Gemini API key and model selection.
- `scripts/content.js`: Content script that programmatically handles lazy-load scrolling and scrapes DOM text/metadata.
- `scripts/background.js`: Handles API requests to the Gemini endpoint securely.

---

## 📦 Pushing to GitHub

If you want to upload this code to your own GitHub account:

1. Open your terminal and navigate to this folder:
   ```bash
   cd intercom-summarizer
   ```
2. Create a new repository on your [GitHub](https://github.com/) account (do not initialize with README or .gitignore).
3. Run the following commands in your terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Intercom Summarizer Extension"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```
