import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { documents } from '$lib/server/database/schema';
import type { RequestHandler } from './$types';

const CONTENT_TYPES: Record<string, string> = {
	'.aac': 'audio/aac',
	'.aif': 'audio/aiff',
	'.aiff': 'audio/aiff',
	'.flac': 'audio/flac',
	'.m4a': 'audio/mp4',
	'.mp3': 'audio/mpeg',
	'.oga': 'audio/ogg',
	'.ogg': 'audio/ogg',
	'.opus': 'audio/opus',
	'.wav': 'audio/wav',
	'.webm': 'audio/webm',
	'.wma': 'audio/x-ms-wma'
};

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
	if (!match) return null;

	const [, rawStart, rawEnd] = match;
	if (!rawStart && !rawEnd) return null;

	const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
	const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

	if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
	return { start, end };
}

export const GET: RequestHandler = async ({ params, request }) => {
	const [document] = await db
		.select({ sourcePath: documents.sourcePath, sourceType: documents.sourceType })
		.from(documents)
		.where(eq(documents.id, params.id))
		.limit(1);

	if (!document) throw error(404, 'Document not found.');
	if (document.sourceType !== 'AUDIO') throw error(400, 'Only audio documents have playback.');

	// Managed copies are stored relative to the project; manually ingested audio keeps its own path
	const filePath = resolve(process.cwd(), document.sourcePath);
	let size: number;
	try {
		size = (await stat(filePath)).size;
	} catch {
		throw error(404, 'Audio file not found.');
	}

	const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
	const range = parseRange(request.headers.get('range'), size);

	// Seeking depends on partial responses, so honour Range instead of always sending the whole file
	if (range) {
		const stream = createReadStream(filePath, { start: range.start, end: range.end });
		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 206,
			headers: {
				'Accept-Ranges': 'bytes',
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
				'Content-Type': contentType
			}
		});
	}

	return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': String(size),
			'Content-Type': contentType
		}
	});
};
