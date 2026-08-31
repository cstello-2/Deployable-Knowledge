import { API_NOTEBOOKS } from '$lib/constants';
import type {
	ApiNotebookPageContentRequest,
	ApiNotebookPageImportRequest,
	ApiNotebookPageMoveRequest,
	ApiNotebookPageTitleRequest,
	ApiNotebookSourcesRequest,
	ApiNotebookTitleRequest,
	ApiReorderRequest,
	ApiReorderResponse,
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

	static reorderNotebooks(orderedIds: string[]) {
		return apiPatch<ApiReorderResponse, ApiReorderRequest>(API_NOTEBOOKS.BASE, { orderedIds });
	}

	static exportNotebook(id: string) {
		return apiDownload(API_NOTEBOOKS.export(id), 'notebook.zip');
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

	static reorderPages(id: string, orderedIds: string[]) {
		return apiPatch<ApiReorderResponse, ApiReorderRequest>(API_NOTEBOOKS.pages(id), {
			orderedIds
		});
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

	static importCollection(title: string, files: { path: string; file: File }[]) {
		const body = new FormData();
		body.append('title', title);
		for (const { path, file } of files) {
			body.append('paths', path);
			body.append('files', file, file.name);
		}
		return apiFetch<NotebookStateResponse>(API_NOTEBOOKS.IMPORT, { method: 'POST', body });
	}

	static importPage(id: string, name: string, content: string) {
		return apiPost<NotebookStateResponse, ApiNotebookPageImportRequest>(
			API_NOTEBOOKS.importPages(id),
			{ name, content }
		);
	}

	static exportPage(notebookId: string, pageId: string) {
		return apiDownload(API_NOTEBOOKS.exportPage(notebookId, pageId), 'notebook-page.md');
	}
}
