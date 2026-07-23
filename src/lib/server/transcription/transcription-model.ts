import {
	env,
	pipeline,
	type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers';
import { resolve } from 'node:path';
import wavefile from 'wavefile';
import type { TranscriptionResult } from '$lib/types';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-tiny.en';

const TRANSFORMERS_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');

env.allowRemoteModels = true;
env.cacheDir = TRANSFORMERS_CACHE_DIR;
env.localModelPath = TRANSFORMERS_CACHE_DIR;

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export async function transcribeAudio(
	audioBytes: Uint8Array
): Promise<Omit<TranscriptionResult, 'fileName'>> {
	transcriptionPipeline ??= pipeline('automatic-speech-recognition', TRANSCRIPTION_MODEL, {
		cache_dir: TRANSFORMERS_CACHE_DIR
	});

	const wav = new wavefile.WaveFile(audioBytes);
	wav.toBitDepth('32f');
	wav.toSampleRate(16_000);

	const audioData = toMonoAudio(
		wav.getSamples() as Float32Array | Float64Array | (Float32Array | Float64Array)[]
	);

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

function toMonoAudio(
	samples: Float32Array | Float64Array | (Float32Array | Float64Array)[]
): Float32Array {
	const channels = Array.isArray(samples) ? samples : [samples];
	const firstChannel = channels[0];

	if (!firstChannel) throw new Error('The WAV file contains no audio samples.');

	const mono = new Float32Array(firstChannel.length);

	for (let index = 0; index < mono.length; index += 1) {
		let value = 0;
		for (const channel of channels) value += channel[index] ?? 0;
		mono[index] = value / channels.length;
	}

	return mono;
}