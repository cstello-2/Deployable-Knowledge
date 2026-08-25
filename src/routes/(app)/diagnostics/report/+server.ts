import {
	buildDiagnosticsSnapshot,
	formatDiagnosticsReport,
	readDiagnosticEvents
} from '$lib/server/diagnostics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const snapshot = await buildDiagnosticsSnapshot();
	const { events } = readDiagnosticEvents();

	return new Response(formatDiagnosticsReport(snapshot, events), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': 'attachment; filename="deployable-knowledge-diagnostics.txt"',
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
