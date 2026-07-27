import { error, json } from '@sveltejs/kit';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import type { ApiTranscriptionPathRequest } from '$lib/types';
import { containsPath } from '$lib/server/documents/remove-document';
import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import { transcribeAudio } from '$lib/server/transcription/transcription-model';
import { isSupportedAudioPath } from '$lib/utils';
import type { RequestHandler } from './$types';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as ApiTranscriptionPathRequest | null;

	if (typeof body?.path !== 'string' || !body.path.trim()) {
		throw error(400, 'Select an audio file.');
	}

	const root = await realpath(homedir());
	let audioPath: string;
	let audioStats: Awaited<ReturnType<typeof stat>>;

	try {
		audioPath = await realpath(resolve(body.path));
		audioStats = await stat(audioPath);
	} catch {
		throw error(400, 'Audio file does not exist or cannot be read.');
	}

	if (!containsPath(root, audioPath) || !audioStats.isFile()) {
		throw error(403, 'Select an audio file inside your home folder.');
	}

	if (!isSupportedAudioPath(audioPath)) {
		throw error(415, 'Unsupported audio format.');
	}

	if (audioStats.size === 0) {
		throw error(400, 'The audio file is empty.');
	}

	if (audioStats.size > MAX_AUDIO_BYTES) {
		throw error(413, 'Audio files must be 100 MB or smaller.');
	}

	let audioData: Float32Array;

	try {
		audioData = await decodeAudioFile(audioPath);
	} catch (cause) {
		console.error('Audio decoding failed', cause);
		throw error(422, 'Unable to decode this audio file. Check the format and try again.');
	}

	return json({
		fileName: basename(audioPath),
		...(await transcribeAudio(audioData))
	});
};
