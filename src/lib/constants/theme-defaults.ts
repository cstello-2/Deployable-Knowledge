export const THEME_COLORS = [
	'classic',
	'purple',
	'blue',
	'yellow',
	'green',
	'high-contrast'
] as const;

export const THEME_MODES = ['light', 'dark', 'system'] as const;

export type ThemeColor = (typeof THEME_COLORS)[number];
export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_THEME = {
	color: 'classic',
	mode: 'system'
} as const satisfies { color: ThemeColor; mode: ThemeMode };

export function parseThemeColor(value: unknown): ThemeColor {
	if (typeof value !== 'string') return DEFAULT_THEME.color;
	const normalized = value.toLowerCase().replaceAll(' ', '-');
	return THEME_COLORS.includes(normalized as ThemeColor)
		? (normalized as ThemeColor)
		: DEFAULT_THEME.color;
}

export function parseThemeMode(value: unknown): ThemeMode {
	if (typeof value !== 'string') return DEFAULT_THEME.mode;
	const normalized = value.toLowerCase();
	return THEME_MODES.includes(normalized as ThemeMode)
		? (normalized as ThemeMode)
		: DEFAULT_THEME.mode;
}
