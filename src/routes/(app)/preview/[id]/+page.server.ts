import { access, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { APP_TRANSCRIPTS } from '$lib/constants';
import { db } from '$lib/server/database/database';
import { documentChunks, documents } from '$lib/server/database/schema';
import { previewPathFor } from '$lib/server/documents/managed-artifacts';
import { splitMarkdownByChunks, splitTextByChunks } from '$lib/server/documents/text-preview';
import type { PageServerLoad } from './$types';

const MAX_PREVIEW_TEXT_BYTES = 1024 * 1024;

export const load: PageServerLoad = async ({ params, url }) => {
	const document = await db.select().from(documents).where(eq(documents.id, params.id)).get();

	if (!document) throw error(404, 'Document not found.');
	if (document.sourceType === 'AUDIO' || document.sourceType === 'YOUTUBE') {
		throw redirect(302, APP_TRANSCRIPTS.byId(document.id));
	}

	const summary = {
		id: document.id,
		title: document.title,
		sourceType: document.sourceType
	};

	if (document.sourceType === 'TEXT' || document.sourceType === 'CSV') {
		let raw: Buffer;
		try {
			raw = await readFile(resolve(process.cwd(), document.sourcePath));
		} catch {
			throw error(404, 'Document file not found.');
		}

		const extension = extname(document.sourcePath).toLowerCase();
		const format: 'markdown' | 'plain' =
			extension === '.md' || extension === '.markdown' ? 'markdown' : 'plain';
		const content = raw
			.subarray(0, MAX_PREVIEW_TEXT_BYTES)
			.toString('utf8')
			.replace(/^\uFEFF/, '');

		const requested = url.searchParams.get('chunk')?.trim();
		const parsed = requested ? Number(requested) : Number.NaN;
		const focusChunkIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
		const chunks = await textChunks(document.id);
		const segments =
			format === 'markdown'
				? splitMarkdownByChunks(content, chunks)
				: splitTextByChunks(content, chunks);

		return {
			document: summary,
			format,
			truncated: raw.byteLength > MAX_PREVIEW_TEXT_BYTES,
			focusChunkIndex,
			segments
		};
	}

	let previewAvailable = true;
	if (document.sourceType === 'XLSX') {
		previewAvailable = await access(
			resolve(process.cwd(), previewPathFor(document.sourcePath))
		).then(
			() => true,
			() => false
		);
	}

	return { document: summary, previewAvailable };
};

function textChunks(documentId: string) {
	return db
		.select({ chunkIndex: documentChunks.chunkIndex, content: documentChunks.content })
		.from(documentChunks)
		.where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.chunkType, 'TEXT')))
		.orderBy(asc(documentChunks.pageIndex), asc(documentChunks.chunkIndex));
}
