import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import {
	DEFAULT_THEME,
	parseThemeColor,
	parseThemeMode,
	type ThemeColor,
	type ThemeMode
} from '$lib/constants';
import { ThemeService } from '$lib/services';

class ThemeStore {
	private initialized = false;
	private systemDark: MediaQueryList | null = null;
	color = $state<ThemeColor>(DEFAULT_THEME.color);
	mode = $state<ThemeMode>(DEFAULT_THEME.mode);

	init(): void {
		if (!browser || this.initialized) return;
		this.initialized = true;

		// `handle` in hooks.server.ts stamped the stored theme onto <html> before the
		// document was sent, so the DOM already holds the persisted values.
		const root = document.documentElement;
		this.color = parseThemeColor(root.dataset.theme);
		this.mode = parseThemeMode(root.dataset.mode);

		this.systemDark = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemDark.addEventListener('change', this.handleSystemChange);
	}

	setColor(color: ThemeColor): void {
		if (color === this.color) return;
		this.color = color;
		this.apply();
		void this.save();
	}

	setMode(mode: ThemeMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		this.apply();
		void this.save();
	}

	private apply(): void {
		if (!browser) return;
		const root = document.documentElement;
		const dark = this.mode === 'dark' || (this.mode === 'system' && this.prefersDark());

		root.dataset.theme = this.color;
		root.dataset.mode = this.mode;
		root.classList.toggle('dark', dark);
		root.style.colorScheme = dark ? 'dark' : 'light';
	}

	private prefersDark(): boolean {
		return this.systemDark?.matches ?? false;
	}

	private async save(): Promise<void> {
		try {
			await ThemeService.update({ color: this.color, mode: this.mode });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	private handleSystemChange = (): void => {
		if (this.mode === 'system') this.apply();
	};
}

export const themeStore = new ThemeStore();
