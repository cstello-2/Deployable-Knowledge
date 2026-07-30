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

export function documentViewerHref(
	sourceType: Document['sourceType'] | undefined,
	documentId: string,
	location: { chunkIndex?: number | null; pageIndex?: number | null }
): string {
	if (sourceType === 'AUDIO') return APP_TRANSCRIPTS.chunk(documentId, location.chunkIndex ?? 0);
	return APP_PREVIEW.page(documentId, location.pageIndex ?? 0);
}

export const API_DOCUMENTS = {
	ACTIVATION: '/documents/activation',
	BASE: '/documents',
	DIRECTORIES: '/documents/directories',
	FOLDERS: '/documents/folders',
	LIST: '/documents/list',
	TAGS: '/documents/tags',
	byId: (id: string) => `/documents/${segment(id)}`,
	folder: (id: string) => `/documents/folders/${segment(id)}`
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
	byId: (id: string) => `/providers/${segment(id)}`
};

export const API_SEARCH = '/search';

export const API_SESSIONS = {
	BASE: '/sessions',
	byId: (id: string) => `/sessions/${segment(id)}`,
	messages: (id: string) => `/sessions/${segment(id)}/messages`
};

export const API_SETUP = '/setup';

export const API_TOOLS = '/tools';
