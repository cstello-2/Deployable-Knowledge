import { json, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { notebookPages, notebooks } from '$lib/server/database/schema';
import {
	notebookExportFilename,
	notebookMarkdown,
	notebookPdf
} from '$lib/server/notebooks/page-export';

interface ExportRequest {
	format?: unknown;
	pageIds?: unknown;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });
	const body = (await request.json()) as ExportRequest;
	if (body.format !== 'markdown' && body.format !== 'pdf') {
		return json({ error: 'Export format must be markdown or pdf' }, { status: 400 });
	}
	if (!Array.isArray(body.pageIds) || !body.pageIds.length) {
		return json({ error: 'Select at least one notebook page' }, { status: 400 });
	}

	const [notebook] = await db
		.select({ title: notebooks.title })
		.from(notebooks)
		.where(eq(notebooks.id, notebookId))
		.limit(1);
	if (!notebook) return json({ error: 'Notebook not found' }, { status: 404 });

	const selected = new Set(body.pageIds.filter((id): id is string => typeof id === 'string'));
	const pages = (
		await db
			.select({
				id: notebookPages.id,
				pageTitle: notebookPages.title,
				content: notebookPages.content
			})
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, notebookId))
			.orderBy(asc(notebookPages.createdAt))
	).filter(({ id }) => selected.has(id));
	if (!pages.length) return json({ error: 'Select at least one notebook page' }, { status: 400 });

	const exportData = { notebookTitle: notebook.title, pages };
	const extension = body.format === 'markdown' ? 'md' : 'pdf';
	const filename = notebookExportFilename(notebook.title, extension);
	if (body.format === 'markdown') {
		return new Response(notebookMarkdown(exportData), {
			headers: downloadHeaders('text/markdown; charset=utf-8', filename)
		});
	}
	const pdf = await notebookPdf(exportData);
	return new Response(new Uint8Array(pdf), {
		headers: downloadHeaders('application/pdf', filename)
	});
};

function downloadHeaders(contentType: string, filename: string) {
	return {
		'Content-Type': contentType,
		'Content-Disposition': `attachment; filename="${filename}"`,
		'Cache-Control': 'no-store'
	};
}
