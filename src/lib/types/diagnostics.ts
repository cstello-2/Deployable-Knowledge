export type DiagnosticLevel = 'info' | 'warning' | 'error';

export type DiagnosticSubsystem =
	| 'application'
	| 'chat'
	| 'database'
	| 'documents'
	| 'embedding'
	| 'models'
	| 'ocr'
	| 'provider'
	| 'search';

export type DiagnosticValue = boolean | number | string | null;

export interface DiagnosticEvent {
	code: string;
	details: Record<string, DiagnosticValue>;
	level: DiagnosticLevel;
	message: string;
	sequence: number;
	subsystem: DiagnosticSubsystem;
	timestamp: string;
}

export interface ApiDiagnosticEventsResponse {
	events: DiagnosticEvent[];
	latestSequence: number;
}

export interface ApiDiagnosticsSnapshot {
	application: {
		memoryBytes: number;
		runtimeMode: 'development' | 'production';
		uptimeSeconds: number;
		version: string;
	};
	counts: {
		activeDocuments: number | null;
		chunks: number | null;
		documents: number | null;
		messages: number | null;
		notebookPages: number | null;
		notebooks: number | null;
		sessions: number | null;
		syncedFolders: number | null;
	};
	generatedAt: string;
	health: {
		database: 'healthy' | 'unavailable';
		embeddingModel: 'installed' | 'missing' | 'unavailable';
		searchIndex: 'ready' | 'out-of-sync' | 'unavailable';
	};
}
