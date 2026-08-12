import { API_THEME } from '$lib/constants';
import type { ThemeSettings } from '$lib/types';
import { apiPatch } from '$lib/utils';

export class ThemeService {
	static update(values: ThemeSettings) {
		return apiPatch<ThemeSettings, ThemeSettings>(API_THEME, values);
	}
}
