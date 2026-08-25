import { error, json } from '@sveltejs/kit';
import { readDiagnosticEvents } from '$lib/server/diagnostics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const rawAfter = url.searchParams.get('after');
	const after = rawAfter === null ? 0 : Number(rawAfter);

	if (!Number.isSafeInteger(after) || after < 0) {
		throw error(400, 'The after parameter must be a non-negative integer.');
	}

	return json(readDiagnosticEvents(after), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
