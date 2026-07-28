import { json, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { notebookPages, notebooks } from '$lib/server/database/schema';
import { storeNotebookInMasterCorpus } from '$lib/server/notebooks/master-corpus';

interface MasterCorpusRequest {
	pageIds?: unknown;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });
	const body = (await request.json()) as MasterCorpusRequest;
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
				title: notebookPages.title,
				content: notebookPages.content
			})
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, notebookId))
			.orderBy(asc(notebookPages.createdAt))
	)
		.map((page, pageIndex) => ({ ...page, pageIndex }))
		.filter(({ id }) => selected.has(id));
	if (!pages.length) {
		return json({ error: 'Select at least one notebook page' }, { status: 400 });
	}

	try {
		return json(
			await storeNotebookInMasterCorpus({
				notebookId,
				notebookTitle: notebook.title,
				pages
			})
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Master Corpus export failed';
		return json({ error: message }, { status: message.startsWith('Select at least') ? 400 : 500 });
	}
};
