/*This transcription service runs on the Hugging Face Transformers library using the
Xenova Whisper Tiny English model. While it handles English audio transcription well, it may not perform 
as accurately on complex/chaotic audio scenarios. Looking into using larger models*/

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { resolve } from 'node:path';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-tiny.en';

const TRANSFORMERS_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');

env.allowRemoteModels = true;
env.cacheDir = TRANSFORMERS_CACHE_DIR;
env.localModelPath = TRANSFORMERS_CACHE_DIR;

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export type TranscriptSegment = {
	startMs: number;
	endMs: number;
	text: string;
};

export type TranscriptionResult = {
	text: string;
	segments: TranscriptSegment[];
};

export async function transcribeAudio(audioData: Float32Array): Promise<TranscriptionResult> {
	transcriptionPipeline ??= pipeline('automatic-speech-recognition', TRANSCRIPTION_MODEL, {
		cache_dir: TRANSFORMERS_CACHE_DIR
	});

	const transcriber = await transcriptionPipeline;

	// Timestamps let the pipeline stitch the 30 second windows of long audio back together
	const result = await transcriber(audioData, {
		chunk_length_s: 30,
		return_timestamps: true,
		stride_length_s: 5
	});

	const segments = (result.chunks ?? []).flatMap<TranscriptSegment>((segment) => {
		const text = segment.text?.trim() ?? '';
		const [start, end] = segment.timestamp ?? [];
		if (!text || typeof start !== 'number') return [];

		const endSeconds = typeof end === 'number' ? Math.max(end, start) : start;

		return [
			{
				startMs: Math.max(0, Math.round(start * 1000)),
				endMs: Math.max(0, Math.round(endSeconds * 1000)),
				text
			}
		];
	});

	return { text: result.text.trim(), segments };
}
