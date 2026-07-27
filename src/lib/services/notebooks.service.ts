import { API_NOTEBOOKS } from '$lib/constants';
import type {
	ApiNotebookPageContentRequest,
	ApiNotebookPageMoveRequest,
	ApiNotebookPageTitleRequest,
	ApiNotebookMarkdownImportRequest,
	ApiNotebookSourcesRequest,
	ApiNotebookTitleRequest,
	NotebookSourceItem,
	NotebookStateResponse
} from '$lib/types';
import { apiDelete, apiDownload, apiFetch, apiPatch, apiPost } from '$lib/utils';

export class NotebooksService {
	static list() {
		return apiFetch<NotebookStateResponse>(API_NOTEBOOKS.BASE);
	}

	static create(title: string) {
		return apiPost<NotebookStateResponse, ApiNotebookTitleRequest>(API_NOTEBOOKS.BASE, { title });
	}

	static rename(id: string, title: string) {
		return apiPatch<NotebookStateResponse, ApiNotebookTitleRequest>(API_NOTEBOOKS.byId(id), {
			title
		});
	}

	static delete(id: string) {
		return apiDelete<NotebookStateResponse>(API_NOTEBOOKS.byId(id));
	}

	static exportNotebook(id: string) {
		return apiDownload(API_NOTEBOOKS.export(id), 'notebook.md');
	}

	static select(id: string) {
		return apiPost<NotebookStateResponse, Record<string, never>>(API_NOTEBOOKS.select(id), {});
	}

	static createPage(id: string, title: string) {
		return apiPost<NotebookStateResponse, ApiNotebookPageTitleRequest>(API_NOTEBOOKS.pages(id), {
			title
		});
	}

	static updatePage(id: string, pageId: string, content: string) {
		return apiPatch<NotebookStateResponse, ApiNotebookPageContentRequest>(
			API_NOTEBOOKS.page(id, pageId),
			{ content }
		);
	}

	static renamePage(id: string, pageId: string, title: string) {
		return apiPatch<NotebookStateResponse, ApiNotebookPageTitleRequest>(
			API_NOTEBOOKS.page(id, pageId),
			{ title }
		);
	}

	static deletePage(id: string, pageId: string) {
		return apiDelete<NotebookStateResponse>(API_NOTEBOOKS.page(id, pageId));
	}

	static movePage(id: string, pageId: string, destinationNotebookId: string) {
		return apiPatch<NotebookStateResponse, ApiNotebookPageMoveRequest>(
			API_NOTEBOOKS.movePage(id, pageId),
			{ destinationNotebookId }
		);
	}

	static selectPage(id: string, pageId: string) {
		return apiPost<NotebookStateResponse, Record<string, never>>(
			API_NOTEBOOKS.selectPage(id, pageId),
			{}
		);
	}

	static listSources(id: string) {
		return apiFetch<{ sources: NotebookSourceItem[] }>(API_NOTEBOOKS.sources(id));
	}

	static addSources(id: string, chunkIds: string[]) {
		return apiPost<{ ok: true; added: number }, ApiNotebookSourcesRequest>(
			API_NOTEBOOKS.sources(id),
			{ chunk_ids: chunkIds }
		);
	}

	static clearSources(id: string) {
		return apiDelete<{ ok: true }>(API_NOTEBOOKS.sources(id));
	}

	static removeSource(id: string, sourceId: string) {
		return apiDelete<{ ok: true }>(API_NOTEBOOKS.source(id, sourceId));
	}

	static importMarkdown(id: string, path: string) {
		return apiPost<NotebookStateResponse, ApiNotebookMarkdownImportRequest>(
			API_NOTEBOOKS.importMarkdown(id),
			{ path }
		);
	}
}
