import type {
	ApiDiagnosticEventsResponse,
	DiagnosticEvent,
	DiagnosticLevel,
	DiagnosticSubsystem,
	EmbeddingBackend
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
		fileName: string;
		pageCount: number;
		sourceType: Document['sourceType'];
	}): void {
		append('info', 'documents', 'DOCUMENT_INGEST_COMPLETED', 'Document ingestion completed', {
			fileName: input.fileName,
			sourceType: input.sourceType,
			pageCount: count(input.pageCount),
			chunkCount: count(input.chunkCount),
			durationMs: duration(input.durationMs)
		});
	},

	documentIngestFailed(input: { fileName: string; sourceType: Document['sourceType'] }): void {
		append('error', 'documents', 'DOCUMENT_INGEST_FAILED', 'Document ingestion failed', {
			fileName: input.fileName,
			sourceType: input.sourceType
		});
	},

	embeddingFailed(): void {
		append('error', 'embedding', 'EMBEDDING_MODEL_FAILED', 'Embedding model failed to load');
	},

	embeddingReady(input: { backend: EmbeddingBackend; durationMs: number; model: string }): void {
		append('info', 'embedding', 'EMBEDDING_MODEL_READY', 'Embedding model ready', {
			backend: input.backend,
			durationMs: duration(input.durationMs),
			model: input.model
		});
	},

	embeddingRefreshCompleted(input: { chunks: number; durationMs: number }): void {
		append('info', 'embedding', 'EMBEDDING_REFRESH_COMPLETED', 'Stored embeddings refreshed', {
			chunks: count(input.chunks),
			durationMs: duration(input.durationMs)
		});
	},

	embeddingRefreshFailed(): void {
		append('error', 'embedding', 'EMBEDDING_REFRESH_FAILED', 'Stored embedding refresh failed');
	},

	embeddingRefreshStarted(chunks: number): void {
		append('info', 'embedding', 'EMBEDDING_REFRESH_STARTED', 'Refreshing stored embeddings', {
			chunks: count(chunks)
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
