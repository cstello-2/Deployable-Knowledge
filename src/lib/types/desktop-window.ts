/** Exposed by `electron/preload.cjs`; absent outside the desktop app. */
export interface DesktopWindowBridge {
	close(): void;
	isMaximized(): Promise<boolean>;
	minimize(): void;
	onMaximizedChange(listener: (maximized: boolean) => void): void;
	toggleMaximize(): void;
}
