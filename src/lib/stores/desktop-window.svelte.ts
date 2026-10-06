import { browser } from '$app/environment';
import { DesktopWindowService } from '$lib/services';

class DesktopWindowStore {
	private initialized = false;
	available = $state(false);
	maximized = $state(false);

	async init(): Promise<void> {
		if (!browser || this.initialized || !DesktopWindowService.available) return;
		this.initialized = true;
		this.available = true;

		DesktopWindowService.onMaximizedChange(this.setMaximized);
		this.setMaximized(await DesktopWindowService.isMaximized());
	}

	private setMaximized = (maximized: boolean): void => {
		if (maximized === this.maximized) return;
		this.maximized = maximized;
	};
}

export const desktopWindowStore = new DesktopWindowStore();
