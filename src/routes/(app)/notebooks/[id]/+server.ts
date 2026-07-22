import { json, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { ApiNotebookTitleRequest } from '$lib/types';
import { NOTEBOOK_USER_ID } from '$lib/server/database/constants';
import { db } from '$lib/server/database/database';
import { notebooks, type Notebook } from '$lib/server/database/schema';
import {
	createDefaultNotebook,
	loadNotebookState,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = params.id;
	if (!id) return json({ error: 'Missing notebook id' }, { status: 400 });
	const body = (await request.json()) as ApiNotebookTitleRequest;
	const title = body.title.trim();
	if (!title) return json({ error: 'Notebook title is required' }, { status: 400 });

	await db
		.update(notebooks)
		.set({ title, updatedAt: new Date().toISOString() })
		.where(eq(notebooks.id, id));
	return json(await loadNotebookState());
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!id) return json({ error: 'Missing notebook id' }, { status: 400 });
	await db.delete(notebooks).where(eq(notebooks.id, id));
	const remaining: Notebook[] = await db
		.select()
		.from(notebooks)
		.where(eq(notebooks.userId, NOTEBOOK_USER_ID))
		.orderBy(asc(notebooks.createdAt));

	if (remaining.length) await setActiveNotebook(remaining[0].id);
	else await createDefaultNotebook();
	return json(await loadNotebookState());
};
