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

export function isSupportedAudioPath(path: string): boolean {
    const normalized = path.toLowerCase();
    return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}