import { fetchYoutubeTranscript } from '$lib/server/youtube/transcript-client';
import { parseYoutubeVideoId } from '$lib/utils';
import { buildTranscriptExtraction } from './transcript-extract';
import type { ExtractionResult, Source } from './parse-shared';

export async function extractYoutubeTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const videoId = parseYoutubeVideoId(source.path);
	if (!videoId) throw new Error('This document is not a YouTube video.');

	onProgress?.(0.25, 'Downloading captions');
	const { segments } = await fetchYoutubeTranscript(videoId);

	return buildTranscriptExtraction(source, segments);
}
