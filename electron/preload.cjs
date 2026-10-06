// Sandboxed preloads cannot load ES modules or TypeScript.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
	close: () => ipcRenderer.send('window:close'),
	isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
	minimize: () => ipcRenderer.send('window:minimize'),
	onMaximizedChange: (listener) => {
		ipcRenderer.on('window:maximized-changed', (_event, maximized) => listener(maximized));
	},
	toggleMaximize: () => ipcRenderer.send('window:toggle-maximize')
});
