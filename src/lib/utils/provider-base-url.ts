const CHAT_COMPLETIONS_SUFFIX = /\/chat\/completions\/*$/;

export function normalizeProviderBaseUrl(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return null;
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.search || url.hash) return null;

	const path = url.pathname.replace(CHAT_COMPLETIONS_SUFFIX, '').replace(/\/+$/, '');
	return `${url.origin}${path}`;
}
