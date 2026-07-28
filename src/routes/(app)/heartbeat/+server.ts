import { json } from '@sveltejs/kit';
import { databaseClient } from '$lib/server/database/database';
import type { RequestHandler } from './$types';

const NO_CACHE_HEADERS = {
	'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export const GET: RequestHandler = async () => {
	const checkedAt = new Date().toISOString();

	try {
		await databaseClient.execute('SELECT 1 AS healthy');
		return json({ status: 'online', checkedAt }, { headers: NO_CACHE_HEADERS });
	} catch {
		return json({ status: 'offline', checkedAt }, { status: 503, headers: NO_CACHE_HEADERS });
	}
};
