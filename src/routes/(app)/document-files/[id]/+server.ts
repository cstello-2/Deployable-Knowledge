import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { documents } from '$lib/server/database/schema';
import { previewPathFor } from '$lib/server/documents/managed-artifacts';
import type { RequestHandler } from './$types';

const PDF_BACKED_SOURCE_TYPES = ['PDF', 'DOCX', 'PPTX'];

export const GET: RequestHandler = async ({ params }) => {
	const document = await db.select().from(documents).where(eq(documents.id, params.id)).get();

	if (!document) {
		throw error(404, 'Document not found.');
	}

	let sourcePath: string;
	if (document.sourceType === 'XLSX') {
		sourcePath = previewPathFor(document.sourcePath);
	} else if (PDF_BACKED_SOURCE_TYPES.includes(document.sourceType)) {
		sourcePath = document.sourcePath;
	} else {
		throw error(400, 'This document has no PDF view.');
	}

	try {
		const file = await readFile(resolve(process.cwd(), sourcePath));
		const filename = `${document.title.replace(/[\r\n"]/g, '')}.pdf`;

		return new Response(new Uint8Array(file), {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${filename}"`
			}
		});
	} catch {
		throw error(404, 'PDF file not found.');
	}
};
