import { access, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { APP_TRANSCRIPTS } from '$lib/constants';
import { db } from '$lib/server/database/database';
import { documents } from '$lib/server/database/schema';
import { previewPathFor } from '$lib/server/documents/managed-artifacts';
import type { PageServerLoad } from './$types';

const MAX_PREVIEW_TEXT_BYTES = 1024 * 1024;

export const load: PageServerLoad = async ({ params }) => {
	const document = await db.select().from(documents).where(eq(documents.id, params.id)).get();

	if (!document) throw error(404, 'Document not found.');
	if (document.sourceType === 'AUDIO') throw redirect(302, APP_TRANSCRIPTS.byId(document.id));

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

		return {
			document: summary,
			format,
			truncated: raw.byteLength > MAX_PREVIEW_TEXT_BYTES,
			content: raw
				.subarray(0, MAX_PREVIEW_TEXT_BYTES)
				.toString('utf8')
				.replace(/^\uFEFF/, '')
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
