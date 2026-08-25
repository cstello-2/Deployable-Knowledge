import type {
	ApiDiagnosticEventsResponse,
	DiagnosticEvent,
	DiagnosticLevel,
	DiagnosticSubsystem
} from '$lib/types';
import type { Document } from '$lib/server/database/schema';

const MAX_EVENTS = 500;

let sequence = 0;
const events: DiagnosticEvent[] = [];

function append(
	level: DiagnosticLevel,
	subsystem: DiagnosticSubsystem,
	code: string,
	message: string,
	details: DiagnosticEvent['details'] = {}
): void {
	sequence += 1;
	events.push({
		code,
		details,
		level,
		message,
		sequence,
		subsystem,
		timestamp: new Date().toISOString()
	});

	if (events.length > MAX_EVENTS) {
		events.splice(0, events.length - MAX_EVENTS);
	}
}

function duration(value: number): number {
	return Math.max(0, Math.round(value));
}

function count(value: number): number {
	return Math.max(0, Math.floor(value));
}

export const diagnosticEvents = {
	chatCancelled(): void {
		append('info', 'chat', 'CHAT_CANCELLED', 'Chat generation cancelled');
	},

	chatCompleted(input: {
		durationMs: number;
		modelTurns: number;
		toolCalls: number;
		toolTurns: number;
	}): void {
		append('info', 'chat', 'CHAT_COMPLETED', 'Chat generation completed', {
			durationMs: duration(input.durationMs),
			modelTurns: count(input.modelTurns),
			toolCalls: count(input.toolCalls),
			toolTurns: count(input.toolTurns)
		});
	},

	chatGenerationFailed(): void {
		append('error', 'chat', 'CHAT_GENERATION_FAILED', 'Chat generation failed');
	},

	chatPersistenceFailed(): void {
		append('error', 'chat', 'CHAT_PERSISTENCE_FAILED', 'Chat turn could not be saved');
	},

	chatTitleFailed(): void {
		append('warning', 'chat', 'CHAT_TITLE_FAILED', 'Conversation title generation failed');
	},

	documentIngestCompleted(input: {
		chunkCount: number;
		durationMs: number;
		pageCount: number;
		sourceType: Document['sourceType'];
	}): void {
		append('info', 'documents', 'DOCUMENT_INGEST_COMPLETED', 'Document ingestion completed', {
			chunkCount: count(input.chunkCount),
			durationMs: duration(input.durationMs),
			pageCount: count(input.pageCount),
			sourceType: input.sourceType
		});
	},

	documentIngestFailed(sourceType: Document['sourceType']): void {
		append('error', 'documents', 'DOCUMENT_INGEST_FAILED', 'Document ingestion failed', {
			sourceType
		});
	},

	embeddingFailed(): void {
		append('error', 'embedding', 'EMBEDDING_MODEL_FAILED', 'Embedding model failed to load');
	},

	embeddingReady(durationMs: number): void {
		append('info', 'embedding', 'EMBEDDING_MODEL_READY', 'Embedding model ready', {
			durationMs: duration(durationMs)
		});
	},

	searchCompleted(input: {
		durationMs: number;
		resultCount: number;
		searchMode: 'all' | 'bm25' | 'hybrid' | 'semantic';
	}): void {
		append('info', 'search', 'SEARCH_COMPLETED', 'Search completed', {
			durationMs: duration(input.durationMs),
			resultCount: count(input.resultCount),
			searchMode: input.searchMode
		});
	},

	searchFailed(searchMode: 'all' | 'bm25' | 'hybrid' | 'semantic'): void {
		append('error', 'search', 'SEARCH_FAILED', 'Search failed', { searchMode });
	},

	searchIndexRebuilt(input: { durationMs: number; indexedChunks: number }): void {
		append('info', 'search', 'SEARCH_INDEX_REBUILT', 'Search index rebuilt', {
			durationMs: duration(input.durationMs),
			indexedChunks: count(input.indexedChunks)
		});
	}
};

export function readDiagnosticEvents(afterSequence = 0): ApiDiagnosticEventsResponse {
	return {
		events: events.filter((event) => event.sequence > afterSequence),
		latestSequence: sequence
	};
}

append('info', 'application', 'DIAGNOSTICS_STARTED', 'Diagnostic event collection started');
