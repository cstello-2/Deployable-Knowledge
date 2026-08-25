import type { ApiDiagnosticsSnapshot, DiagnosticEvent } from '$lib/types';

function eventLine(event: DiagnosticEvent): string {
	const details = Object.entries(event.details)
		.map(([key, value]) => `${key}=${String(value)}`)
		.join(' ');

	return [
		event.timestamp,
		event.level.toUpperCase().padEnd(7),
		event.subsystem.toUpperCase().padEnd(12),
		event.code,
		`— ${event.message}`,
		details
	]
		.filter(Boolean)
		.join(' ');
}

export function formatDiagnosticsReport(
	snapshot: ApiDiagnosticsSnapshot,
	events: DiagnosticEvent[]
): string {
	return [
		'Deployable Knowledge Diagnostic Report',
		`Generated: ${snapshot.generatedAt}`,
		'Privacy: prompts, messages, document content, names, paths, search queries, credentials, and raw errors are excluded.',
		'',
		'[Application]',
		`Version: ${snapshot.application.version}`,
		`Runtime: ${snapshot.application.runtimeMode}`,
		`Uptime seconds: ${snapshot.application.uptimeSeconds}`,
		`Resident memory bytes: ${snapshot.application.memoryBytes}`,
		'',
		'[Health]',
		`Database: ${snapshot.health.database}`,
		`Search index: ${snapshot.health.searchIndex}`,
		`Embedding model: ${snapshot.health.embeddingModel}`,
		'',
		'[Counts]',
		...Object.entries(snapshot.counts).map(([key, value]) => `${key}: ${value ?? 'unavailable'}`),
		'',
		'[Events]',
		...events.map(eventLine),
		''
	].join('\n');
}
