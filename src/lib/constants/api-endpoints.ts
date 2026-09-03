import type { Document } from '$lib/types';

const segment = (value: string) => encodeURIComponent(value);

export const API_DOCUMENT_FILES = {
	byId: (id: string) => `/document-files/${segment(id)}`
};

export const APP_TRANSCRIPTS = {
	byId: (id: string) => `/transcripts/${segment(id)}`,
	chunk: (id: string, chunkIndex: number) =>
		`/transcripts/${segment(id)}?chunk=${segment(String(chunkIndex))}`
};

export const APP_PREVIEW = {
	byId: (id: string) => `/preview/${segment(id)}`,
	page: (id: string, pageIndex: number) => `/preview/${segment(id)}#page=${pageIndex + 1}`
};

export const API_CHUNK_RATINGS = {
	byChunkId: (chunkId: string) => `/chunks/${segment(chunkId)}/rating`
};

export function documentViewerHref(
	sourceType: Document['sourceType'] | undefined,
	documentId: string,
	location: { chunkIndex?: number | null; pageIndex?: number | null }
): string {
	if (sourceType === 'AUDIO' || sourceType === 'YOUTUBE') {
		return APP_TRANSCRIPTS.chunk(documentId, location.chunkIndex ?? 0);
	}
	return APP_PREVIEW.page(documentId, location.pageIndex ?? 0);
}

export const API_DOCUMENTS = {
	ACTIVATION: '/documents/activation',
	BASE: '/documents',
	FOLDERS: '/documents/folders',
	IDS: '/documents/ids',
	LIST: '/documents/list',
	TAGS: '/documents/tags',
	byId: (id: string) => `/documents/${segment(id)}`,
	folder: (id: string) => `/documents/folders/${segment(id)}`,
	folderFiles: (id: string) => `/documents/folders/${segment(id)}/files`,
	folderMalformed: (id: string) => `/documents/folders/${segment(id)}/malformed`,
	folderReconcile: (id: string) => `/documents/folders/${segment(id)}/reconcile`,
	folderRetry: (id: string) => `/documents/folders/${segment(id)}/retry`
};

export const API_NOTEBOOKS = {
	BASE: '/notebooks',
	IMPORT: '/notebooks/import',
	byId: (id: string) => `/notebooks/${segment(id)}`,
	export: (id: string) => `/notebooks/${segment(id)}/export`,
	exportPage: (id: string, pageId: string) =>
		`/notebooks/${segment(id)}/pages/${segment(pageId)}/export`,
	importPages: (id: string) => `/notebooks/${segment(id)}/import`,
	select: (id: string) => `/notebooks/${segment(id)}/select`,
	pages: (id: string) => `/notebooks/${segment(id)}/pages`,
	page: (id: string, pageId: string) => `/notebooks/${segment(id)}/pages/${segment(pageId)}`,
	movePage: (id: string, pageId: string) =>
		`/notebooks/${segment(id)}/pages/${segment(pageId)}/move`,
	selectPage: (id: string, pageId: string) =>
		`/notebooks/${segment(id)}/pages/${segment(pageId)}/select`,
	sources: (id: string) => `/notebooks/${segment(id)}/sources`,
	source: (id: string, sourceId: string) => `/notebooks/${segment(id)}/sources/${segment(sourceId)}`
};

export const API_LOCAL_MODELS = {
	BASE: '/local-models',
	byFile: (fileName: string) => `/local-models/${segment(fileName)}`
};

export const API_PROFILES = {
	BASE: '/profiles',
	ACTIVE: '/profiles/active',
	byId: (id: string) => `/profiles/${segment(id)}`,
	activate: (id: string) => `/profiles/${segment(id)}/activate`
};

export const API_PROMPT_TEMPLATES = {
	BASE: '/prompt-templates',
	byId: (id: string) => `/prompt-templates/${segment(id)}`
};

export const API_PROVIDERS = {
	BASE: '/providers',
	byId: (id: string) => `/providers/${segment(id)}`,
	capabilities: (id: string, model: string) =>
		`/providers/${segment(id)}/capabilities?model=${segment(model)}`
};

export const API_DIAGNOSTICS = {
	BASE: '/diagnostics',
	EVENTS: '/diagnostics/events',
	REPORT: '/diagnostics/report'
};

export const API_SEARCH = '/search';

export const API_SESSIONS = {
	BASE: '/sessions',
	byId: (id: string) => `/sessions/${segment(id)}`,
	messages: (id: string) => `/sessions/${segment(id)}/messages`
};

export const API_SETUP = '/setup';

export const API_THEME = '/theme';

export const API_TOOLS = '/tools';

export const API_WORKSPACE_LAYOUTS = {
	BASE: '/workspace-layouts',
	REORDER: '/workspace-layouts/reorder',
	byId: (id: string) => `/workspace-layouts/${segment(id)}`,
	activate: (id: string) => `/workspace-layouts/${segment(id)}/activate`
};
