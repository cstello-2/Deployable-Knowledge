import { Innertube, Log } from 'youtubei.js';
import type { TranscriptSegment } from '$lib/server/transcription/transcription-model';
import { mintVideoPoToken } from './po-token';

const CAPTION_TIMEOUT_MS = 30_000;

export type YoutubeTranscript = {
	title: string;
	segments: TranscriptSegment[];
};

type CaptionEvent = {
	tStartMs?: number;
	dDurationMs?: number;
	segs?: { utf8?: string }[];
};

Log.setLevel();

let client: Promise<Innertube> | undefined;

function innertube(): Promise<Innertube> {
	client ??= Innertube.create().catch((error) => {
		client = undefined;
		throw error;
	});
	return client;
}

function normalizeCueText(event: CaptionEvent): string {
	return (event.segs ?? [])
		.map((segment) => segment.utf8 ?? '')
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
}

function toSegments(events: CaptionEvent[]): TranscriptSegment[] {
	const spoken = events
		.map((event) => ({ event, text: normalizeCueText(event) }))
		.filter((entry) => entry.text.length > 0);

	return spoken.map(({ event, text }, index) => {
		const startMs = event.tStartMs ?? 0;
		const fallbackEnd = spoken[index + 1]?.event.tStartMs ?? startMs;
		const endMs = event.dDurationMs === undefined ? fallbackEnd : startMs + event.dDurationMs;

		return { startMs, endMs: Math.max(startMs, endMs), text };
	});
}

async function fetchCaptionEvents(baseUrl: string, videoId: string): Promise<CaptionEvent[]> {
	const poToken = await mintVideoPoToken(videoId);
	const url = `${baseUrl}&fmt=json3&pot=${encodeURIComponent(poToken)}&c=WEB`;

	const response = await fetch(url, { signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS) });
	if (!response.ok) {
		throw new Error(`YouTube caption download failed (${response.status}).`);
	}

	const body = await response.text();
	if (!body) {
		throw new Error(
			'YouTube returned an empty caption track. It may be restricted for this video.'
		);
	}

	const payload = JSON.parse(body) as { events?: CaptionEvent[] };
	return payload.events ?? [];
}

const HANDOFF_TTL_MS = 60_000;

let handoff: { videoId: string; expiresAt: number; transcript: YoutubeTranscript } | undefined;

export async function fetchYoutubeTranscript(videoId: string): Promise<YoutubeTranscript> {
	if (handoff?.videoId === videoId && handoff.expiresAt > Date.now()) {
		return handoff.transcript;
	}

	const transcript = await downloadYoutubeTranscript(videoId);
	handoff = { videoId, expiresAt: Date.now() + HANDOFF_TTL_MS, transcript };
	return transcript;
}

async function downloadYoutubeTranscript(videoId: string): Promise<YoutubeTranscript> {
	const youtube = await innertube();
	const info = await youtube.getInfo(videoId);

	const tracks = info.captions?.caption_tracks ?? [];
	if (tracks.length === 0) {
		throw new Error('This video has no captions to import.');
	}

	const track = tracks.find((entry) => entry.kind !== 'asr') ?? tracks[0];

	const events = await fetchCaptionEvents(track.base_url, videoId);

	return {
		title: info.basic_info.title?.trim() || `YouTube video ${videoId}`,
		segments: toSegments(events)
	};
}
