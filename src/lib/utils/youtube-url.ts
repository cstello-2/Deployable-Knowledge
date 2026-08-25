const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

const PATH_PREFIXES = ['shorts', 'embed', 'live', 'v'];

const HOST_SUFFIXES = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

function isVideoId(value: string): boolean {
	return VIDEO_ID_PATTERN.test(value);
}

function hostIsYoutube(hostname: string): boolean {
	const host = hostname.replace(/^www\./, '').toLowerCase();
	return HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function idFromPath(url: URL): string | null {
	const segments = url.pathname.split('/').filter(Boolean);
	if (segments.length === 0) return null;

	if (url.hostname.replace(/^www\./, '').toLowerCase() === 'youtu.be') {
		return isVideoId(segments[0]) ? segments[0] : null;
	}

	const [prefix, candidate] = segments;
	if (!PATH_PREFIXES.includes(prefix) || !candidate) return null;
	return isVideoId(candidate) ? candidate : null;
}

export function parseYoutubeVideoId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (isVideoId(trimmed)) return trimmed;

	let url: URL;
	try {
		url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}

	if (!hostIsYoutube(url.hostname)) return null;

	const queryId = url.searchParams.get('v');
	if (queryId && isVideoId(queryId)) return queryId;

	return idFromPath(url);
}

export function watchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export function watchUrlAtMs(videoId: string, startMs: number): string {
	return `${watchUrl(videoId)}&t=${Math.max(0, Math.floor(startMs / 1000))}s`;
}

export function isYoutubeVideoUrl(input: string): boolean {
	return parseYoutubeVideoId(input) !== null;
}
