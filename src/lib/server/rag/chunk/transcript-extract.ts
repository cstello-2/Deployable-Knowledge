// Audio has no pages, so the whole transcript enters the chunk pipeline as a single text page

import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import { transcribeAudio } from '$lib/server/transcription/transcription-model';
import {
	normalizeWhitespace,
	type ExtractionResult,
	type ParsedChunk,
	type Source,
	type TranscriptTimelineEntry
} from './parse-shared';

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	onProgress?.(0.25, 'Transcribing speech');
	const transcription = await transcribeAudio(audioData);

	const timeline: TranscriptTimelineEntry[] = [];
	let content = '';
	for (const segment of transcription.segments) {
		const spoken = segment.text.trim();
		if (!spoken) continue;

		if (content) content += ' ';
		const charStart = content.length;
		content += spoken;
		timeline.push({
			charStart,
			charEnd: content.length,
			startMs: segment.startMs,
			endMs: segment.endMs
		});
	}

	// Timestamp-less model output still transcribes; it just cannot be followed along during playback
	if (!content) content = normalizeWhitespace(transcription.text);

	// Silent audio transcribes to nothing; ingestion reports the empty result to the user
	if (!content) return { chunks: [], pageCount: 0 };

	return {
		chunks: [{ chunkType: 'TEXT', source, pageIndex: 0, content, timeline }],
		pageCount: 1
	};
}

function timeAtChar(timeline: TranscriptTimelineEntry[], charIndex: number): number {
	for (const entry of timeline) {
		if (charIndex <= entry.charStart) return entry.startMs;

		if (charIndex < entry.charEnd) {
			const span = entry.charEnd - entry.charStart;
			const ratio = span > 0 ? (charIndex - entry.charStart) / span : 0;
			return Math.round(entry.startMs + (entry.endMs - entry.startMs) * ratio);
		}
	}

	return timeline[timeline.length - 1].endMs;
}

export function attachTranscriptTimings(
	chunks: ParsedChunk[],
	timeline: TranscriptTimelineEntry[] = []
): ParsedChunk[] {
	if (timeline.length === 0) return chunks;

	return chunks.map((chunk) => {
		const { startChar, endChar } = chunk;
		if (startChar === undefined || endChar === undefined) return chunk;

		const startMs = timeAtChar(timeline, startChar);
		return {
			...chunk,
			startMs,
			endMs: Math.max(startMs, timeAtChar(timeline, endChar))
		};
	});
}
