import { SUPPORTED_AUDIO_EXTENSIONS } from '$lib/utils/audio-format';

export type DocumentSourceKind =
	| 'pdf'
	| 'audio'
	| 'docx'
	| 'pptx'
	| 'xlsx'
	| 'csv'
	| 'text'
	| 'youtube';

export interface IngestFormat {
	extensions: readonly string[];
	accept: Record<string, readonly string[]>;
}

export const INGEST_FORMATS: Record<DocumentSourceKind, IngestFormat> = {
	pdf: {
		extensions: ['.pdf'],
		accept: { 'application/pdf': ['.pdf'] }
	},
	audio: {
		extensions: SUPPORTED_AUDIO_EXTENSIONS,
		accept: { 'audio/*': SUPPORTED_AUDIO_EXTENSIONS }
	},
	docx: {
		extensions: ['.docx'],
		accept: {
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
		}
	},
	pptx: {
		extensions: ['.pptx'],
		accept: {
			'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
		}
	},
	xlsx: {
		extensions: ['.xlsx'],
		accept: {
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
		}
	},
	csv: {
		extensions: ['.csv'],
		accept: { 'text/csv': ['.csv'] }
	},
	text: {
		extensions: ['.txt', '.md', '.markdown'],
		accept: { 'text/plain': ['.txt', '.md', '.markdown'] }
	},
	youtube: { extensions: [], accept: {} }
};

export const INGESTABLE_FILE_EXTENSIONS: readonly string[] = Object.values(INGEST_FORMATS).flatMap(
	(format) => format.extensions
);

export const INGESTABLE_FILE_ACCEPT: Record<string, readonly string[]> = Object.assign(
	{},
	...Object.values(INGEST_FORMATS).map((format) => format.accept)
);

export const NOTEBOOK_IMPORT_EXTENSIONS = ['.md', '.txt'] as const;

export function fileExtension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isIngestableFileName(name: string): boolean {
	return INGESTABLE_FILE_EXTENSIONS.includes(fileExtension(name));
}

export function isNotebookImportFileName(name: string): boolean {
	return (NOTEBOOK_IMPORT_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}
