import { spawn } from 'node:child_process';
import ffmpegStaticPath from 'ffmpeg-static';

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;
const MAX_AUDIO_SEC = 2 * 60 * 60; // May be lowered in the future to reduce memory usage
const MAX_DECODE_BYTES = MAX_AUDIO_SEC * SAMPLE_RATE * BYTES_PER_SAMPLE;
const MAX_ERR_LENGTH = 16_000;
const DECODE_TIMEOUT_MS = 10 * 60 * 1000;

export function decodeAudioFile(audioPath: string): Promise<Float32Array> {
	const executablePath = process.env.FFMPEG_PATH?.trim() || ffmpegStaticPath;
	if (!executablePath) throw new Error('FFmpeg unavailable.');

	return new Promise((resolve, reject) => {
		const child = spawn(
			executablePath,
			[
				'-nostdin',
				'-hide_banner',
				'-loglevel',
				'error',
				'-i',
				audioPath,
				'-map',
				'0:a:0',
				'-vn',
				'-ac',
				'1',
				'-ar',
				String(SAMPLE_RATE),
				'-c:a',
				'pcm_f32le',
				'-f',
				'f32le',
				'pipe:1'
			],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true
			}
		);

		const chunks: Buffer[] = [];
		let byteLength = 0;
		let errorOutput = '';
		let settled = false;

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(new Error('Audio decoding has timed out.'));
		}, DECODE_TIMEOUT_MS);

		child.stdout.on('data', (chunk: Buffer) => {
			if (settled) return;

			byteLength += chunk.byteLength;
			if (byteLength > MAX_DECODE_BYTES) {
				settled = true;
				clearTimeout(timer);
				child.kill();
				reject(
					new Error(`Audio decoding exceeded maximum allowed size (${MAX_AUDIO_SEC / 3600} hours).`)
				);
				return;
			}
			chunks.push(chunk);
		});

		child.stderr.on('data', (chunk: Buffer) => {
			if (errorOutput.length < MAX_ERR_LENGTH) {
				errorOutput += chunk.toString();
			}
		});

		child.once('error', (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});

		child.once('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);

			if (code !== 0) {
				reject(new Error(errorOutput.trim() || `FFmpeg exited with code ${code}.`));
				return;
			}

			const pcm = Buffer.concat(chunks);
			if (!pcm.byteLength || pcm.byteLength % BYTES_PER_SAMPLE !== 0) {
				reject(new Error('FFmpeg returned invalid or corrupted PCM Audio'));
				return;
			}

			const buffer = pcm.buffer.slice(
				pcm.byteOffset,
				pcm.byteOffset + pcm.byteLength
			) as ArrayBuffer;

			resolve(new Float32Array(buffer));
		});
	});
}
