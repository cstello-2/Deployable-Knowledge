/*
This endpoint handles audio file uploads for transcription. It validates the uploaded file, writes it to a temporary directory, 
invokes the transcription model, and returns the transcription result as JSON. The temporary files are cleaned up after processing.
*/

import { error, json } from '@sveltejs/kit';
import { extname } from 'node:path';
import { transcribeAudio } from '$lib/server/transcription/transcription-model';
import type { RequestHandler } from './$types';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const audio = formData.get('audio');

	if (!(audio instanceof File)) throw error(400, 'Choose a WAV audio file.');
	if (audio.size === 0) throw error(400, 'The audio file is empty.');
	if (audio.size > MAX_AUDIO_BYTES) throw error(413, 'Audio files must be 100 MB or smaller.');
	if (extname(audio.name).toLowerCase() !== '.wav') {
		throw error(415, 'Only WAV audio files are supported currently.');
	}

	return json({
		fileName: audio.name,
		...(await transcribeAudio(Buffer.from(await audio.arrayBuffer())))
	});
};