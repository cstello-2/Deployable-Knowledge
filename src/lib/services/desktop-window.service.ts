import type { DesktopWindowBridge } from '$lib/types';

export class DesktopWindowService {
	static get available(): boolean {
		return window.desktopWindow !== undefined;
	}

	static close(): void {
		bridge().close();
	}

	static isMaximized(): Promise<boolean> {
		return bridge().isMaximized();
	}

	static minimize(): void {
		bridge().minimize();
	}

	static onMaximizedChange(listener: (maximized: boolean) => void): void {
		bridge().onMaximizedChange(listener);
	}

	static toggleMaximize(): void {
		bridge().toggleMaximize();
	}
}

function bridge(): DesktopWindowBridge {
	if (!window.desktopWindow)
		throw new Error('Window controls are only available in the desktop app.');
	return window.desktopWindow;
}
