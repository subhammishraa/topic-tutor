## Nirman Hack Extension

A browser extension to enhance your browsing experience with custom scripts and styles.

### Features
- Injects custom JavaScript and CSS into web pages
- Popup UI for quick actions
- Easy to configure and use

### Installation
1. Clone this repository:
	```powershell
	git clone https://github.com/nitto05/nirman-hack.git
	```
2. Open your browser's extensions page (e.g., `chrome://extensions` for Chrome).
3. Enable "Developer mode".
4. Click "Load unpacked" and select the project folder.

### Usage
- Click the extension icon to open the popup and access features.
- The extension automatically injects scripts/styles as defined in `contentScript.js` and `contentStyles.css`.

### File Structure
- `manifest.json` — Extension manifest/configuration
- `background.js` — Background script for extension events
- `contentScript.js` — JavaScript injected into web pages
- `contentStyles.css` — CSS injected into web pages
- `popup.html` — Popup UI
- `popup.js` — Popup logic
- `icons/` — Extension icons

### Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

### License
This project is licensed under the MIT License.
