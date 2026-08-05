import { json } from '@sveltejs/kit';
import { deleteIngestFailure } from '$lib/server/documents/ingest-failures';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteIngestFailure(params.id);
	return json({ ok: true });
};
