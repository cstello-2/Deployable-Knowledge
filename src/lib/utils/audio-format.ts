export const SUPPORTED_AUDIO_EXTENSIONS = [
	'.aac',
	'.aif',
	'.aiff',
	'.flac',
	'.m4a',
	'.mp3',
	'.oga',
	'.ogg',
	'.opus',
	'.wav',
	'.webm',
	'.wma'
] as const;

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export function assertIngestableAudioSize(byteLength: number): void {
	if (byteLength === 0) throw new Error('The audio file is empty.');
	if (byteLength > MAX_AUDIO_BYTES) {
		throw new Error(`Audio files must be ${MAX_AUDIO_BYTES / 1024 / 1024} MB or smaller.`);
	}
}
