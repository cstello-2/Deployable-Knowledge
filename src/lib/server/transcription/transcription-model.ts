/*This transcription service runs on the Hugging Face Transformers library using the
Xenova Whisper Tiny English model. While it handles English audio transcription well, it may not perform 
as accurately on complex/chaotic audio scenarios. Looking into using larger models*/

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { resolve } from 'node:path';
import type { TranscriptionResult } from '$lib/types';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-tiny.en';

const TRANSFORMERS_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');

env.allowRemoteModels = true;
env.cacheDir = TRANSFORMERS_CACHE_DIR;
env.localModelPath = TRANSFORMERS_CACHE_DIR;

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export async function transcribeAudio(
	audioData: Float32Array
): Promise<Omit<TranscriptionResult, 'fileName'>> {
	transcriptionPipeline ??= pipeline('automatic-speech-recognition', TRANSCRIPTION_MODEL, {
		cache_dir: TRANSFORMERS_CACHE_DIR
	});

	const transcriber = await transcriptionPipeline;
	const result = await transcriber(audioData, {
		chunk_length_s: 30,
		return_timestamps: true,
		stride_length_s: 5
	});

	return {
		text: result.text.trim(),
		segments: (result.chunks ?? []).map((chunk) => ({
			endMs: Math.round(chunk.timestamp[1] * 1000),
			startMs: Math.round(chunk.timestamp[0] * 1000),
			text: chunk.text.trim()
		}))
	};
}