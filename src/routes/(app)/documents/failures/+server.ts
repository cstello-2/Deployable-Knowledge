import { json, type RequestHandler } from '@sveltejs/kit';
import { clearAllIngestFailures, listIngestFailures } from '$lib/server/documents/ingest-failures';

export const GET: RequestHandler = async () => {
	return json({ failures: await listIngestFailures() });
};

export const DELETE: RequestHandler = async () => {
	await clearAllIngestFailures();
	return json({ ok: true });
};
