import { browser } from '$app/environment';
import { setMode, setTheme } from 'mode-watcher';
import { STORAGE_KEYS } from '$lib/constants';

export const THEME_COLORS = [
	'classic',
	'purple',
	'blue',
	'yellow',
	'green',
	'high-contrast'
] as const;
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export type ThemeColor = (typeof THEME_COLORS)[number];

class ThemeStore {
	color = $state<ThemeColor>('classic');
	mode = $state<ThemeMode>('system');

	init(): void {
		if (!browser) return;
		this.color = parseColor(localStorage.getItem(STORAGE_KEYS.THEME_COLOR));
		this.mode = parseMode(localStorage.getItem(STORAGE_KEYS.THEME_MODE));
		this.apply();
	}

	setColor(color: ThemeColor): void {
		this.color = color;
		this.apply();
	}

	setMode(mode: ThemeMode): void {
		this.mode = mode;
		this.apply();
	}

	private apply(): void {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEYS.THEME_COLOR, this.color);
		localStorage.setItem(STORAGE_KEYS.THEME_MODE, this.mode);
		setTheme(this.color);
		setMode(this.mode);
	}
}

function parseColor(value: string | null): ThemeColor {
	const normalized = value?.toLowerCase().replaceAll(' ', '-');
	return THEME_COLORS.includes(normalized as ThemeColor) ? (normalized as ThemeColor) : 'classic';
}

function parseMode(value: string | null): ThemeMode {
	const normalized = value?.toLowerCase();
	return THEME_MODES.includes(normalized as ThemeMode) ? (normalized as ThemeMode) : 'system';
}

export const themeStore = new ThemeStore();
