// Audio has no pages, so the whole transcript enters the chunk pipeline as a single text page

import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import { transcribeAudio } from '$lib/server/transcription/transcription-model';
import { normalizeWhitespace, type ExtractedChunk, type Source } from './parse-shared';

export type TranscriptExtractionResult = {
	chunks: ExtractedChunk[];
	pageCount: number;
};

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<TranscriptExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	onProgress?.(0.25, 'Transcribing speech');
	const content = normalizeWhitespace(await transcribeAudio(audioData));

	// Silent audio transcribes to nothing; ingestion reports the empty result to the user
	if (!content) return { chunks: [], pageCount: 0 };

	return {
		chunks: [{ chunkType: 'TEXT', source, pageIndex: 0, content }],
		pageCount: 1
	};
}
