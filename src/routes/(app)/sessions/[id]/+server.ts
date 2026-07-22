import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { ApiSessionTitleRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { sessions } from '$lib/server/database/schema';
import { SessionsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const session = await SessionsRepository.find(params.id);

	if (!session) return json(null);

	return json(await SessionsRepository.listMessages(params.id));
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiSessionTitleRequest;
	const title = body.title.trim();
	if (!title) {
		return json({ error: 'Session title is required' }, { status: 400 });
	}
	await db.update(sessions).set({ title, updatedAt: new Date() }).where(eq(sessions.id, params.id));

	return json({ status: 'ok', session_id: params.id, title });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await SessionsRepository.delete(params.id);

	return json({ status: 'ok', session_id: params.id });
};
