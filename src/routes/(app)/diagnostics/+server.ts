import { json } from '@sveltejs/kit';
import { buildDiagnosticsSnapshot } from '$lib/server/diagnostics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await buildDiagnosticsSnapshot(), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
