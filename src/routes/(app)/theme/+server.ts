import { json } from '@sveltejs/kit';

import { parseThemeColor, parseThemeMode } from '$lib/constants';
import type { ThemeSettings } from '$lib/types';
import { setThemeSettings } from '$lib/server/database/app-state';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ThemeSettings;

	return json(
		await setThemeSettings({
			color: parseThemeColor(body.color),
			mode: parseThemeMode(body.mode)
		})
	);
};
