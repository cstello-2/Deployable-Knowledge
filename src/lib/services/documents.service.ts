import { API_DOCUMENTS } from '$lib/constants';
import type {
	ApiDocumentActivationRequest,
	ApiDocumentIngestEvent,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult,
	ApiDocumentDirectoryQuery,
	ApiDocumentDirectoryResponse,
	ApiDocumentFolderRequest,
	ApiDocumentFoldersResponse,
	ApiDocumentFolderSyncEvent,
	ApiDocumentFolderSyncResponse,
	ApiDocumentIdsResponse,
	ApiDocumentListQuery,
	ApiDocumentListResponse,
	ApiDocumentPathRequest,
	ApiDocumentSyncFileProgress,
	ApiDocumentTagAssignmentRequest,
	ApiDocumentTagRequest,
	ApiDocumentTextRequest,
	ApiDocumentUrlRequest
} from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost, apiStream, parseNdjsonStream } from '$lib/utils';

function searchString(entries: [string, string | number | string[] | undefined][]): string {
	const params = new URLSearchParams();
	for (const [name, value] of entries) {
		if (value === undefined || value === '') continue;
		if (Array.isArray(value)) for (const item of value) params.append(name, item);
		else params.set(name, String(value));
	}
	const search = params.toString();
	return search ? `?${search}` : '';
}

export class DocumentsService {
	static list({ limit, mode, offset, query, sort, tags }: ApiDocumentListQuery = {}) {
		const search = searchString([
			['q', query?.trim()],
			['mode', mode],
			['sort', sort],
			['tag', tags],
			['limit', limit],
			['offset', offset]
		]);
		return apiFetch<ApiDocumentListResponse>(`${API_DOCUMENTS.LIST}${search}`);
	}

	static listIds({ mode, query, tags }: ApiDocumentListQuery = {}, group?: string) {
		const search = searchString([
			['q', query?.trim()],
			['mode', mode],
			['tag', tags],
			['group', group]
		]);
		return apiFetch<ApiDocumentIdsResponse>(`${API_DOCUMENTS.IDS}${search}`);
	}

	static browseDirectory({ limit, offset, path, sort }: ApiDocumentDirectoryQuery = {}) {
		const search = searchString([
			['path', path],
			['sort', sort],
			['limit', limit],
			['offset', offset]
		]);
		return apiFetch<ApiDocumentDirectoryResponse>(`${API_DOCUMENTS.DIRECTORIES}${search}`);
	}

	static listFolders() {
		return apiFetch<ApiDocumentFoldersResponse>(API_DOCUMENTS.FOLDERS);
	}

	static createTag(tag: string) {
		return apiPost<{ tag: string }, ApiDocumentTagRequest>(API_DOCUMENTS.TAGS, { tag });
	}

	static deleteTag(tag: string) {
		return apiDelete<{ tag: string }, ApiDocumentTagRequest>(API_DOCUMENTS.TAGS, { tag });
	}

	static setTagAssignment(value: ApiDocumentTagAssignmentRequest) {
		return apiPatch<{ status: 'ok' }, ApiDocumentTagAssignmentRequest>(API_DOCUMENTS.TAGS, value);
	}

	static setActivation(value: ApiDocumentActivationRequest) {
		return apiPatch<{ ok: true }, ApiDocumentActivationRequest>(API_DOCUMENTS.ACTIVATION, value);
	}

	static removeAllDocuments() {
		return apiDelete<{ removed: number }>(API_DOCUMENTS.BASE);
	}

	static async ingestPath(
		path: string,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		const response = await apiStream(API_DOCUMENTS.BASE, {
			method: 'POST',
			body: JSON.stringify({ path } satisfies ApiDocumentPathRequest),
			signal
		});
		return this.readIngestStream(response, onProgress, signal);
	}

	static async ingestYoutube(
		url: string,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		const response = await apiStream(API_DOCUMENTS.BASE, {
			method: 'POST',
			body: JSON.stringify({ url } satisfies ApiDocumentUrlRequest),
			signal
		});
		return this.readIngestStream(response, onProgress, signal);
	}

	static async ingestText(
		title: string,
		text: string,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		const response = await apiStream(API_DOCUMENTS.BASE, {
			method: 'POST',
			body: JSON.stringify({ title, text } satisfies ApiDocumentTextRequest),
			signal
		});
		return this.readIngestStream(response, onProgress, signal);
	}

	static async addFolder(
		path: string,
		onProgress?: (progress: ApiDocumentSyncFileProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentFolderSyncResponse> {
		const response = await apiStream(API_DOCUMENTS.FOLDERS, {
			method: 'POST',
			body: JSON.stringify({ path } satisfies ApiDocumentFolderRequest),
			signal
		});
		return this.readFolderSyncStream(response, onProgress, signal);
	}

	static async syncFolder(
		id: string,
		onProgress?: (progress: ApiDocumentSyncFileProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentFolderSyncResponse> {
		const response = await apiStream(API_DOCUMENTS.folder(id), { method: 'POST', signal });
		return this.readFolderSyncStream(response, onProgress, signal);
	}

	static removeFolder(id: string, removeDocuments: boolean) {
		return apiDelete<{ removed: true; removedDocumentIds: string[] }>(
			`${API_DOCUMENTS.folder(id)}?removeDocuments=${removeDocuments}`
		);
	}

	static removeDocument(id: string) {
		return apiDelete<{ removed: true }>(API_DOCUMENTS.byId(id));
	}

	private static async readIngestStream(
		response: Response,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		for await (const event of parseNdjsonStream<ApiDocumentIngestEvent>(response, signal)) {
			if (event.status === 'progress') onProgress?.(event);
			else if (event.status === 'complete') return event.result;
			else throw new Error(event.message);
		}
		throw new Error('Document ingestion ended before completion.');
	}

	private static async readFolderSyncStream(
		response: Response,
		onProgress?: (progress: ApiDocumentSyncFileProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentFolderSyncResponse> {
		let created = false;
		let folderId = '';
		let result: ApiDocumentFolderSyncResponse['result'];

		for await (const event of parseNdjsonStream<ApiDocumentFolderSyncEvent>(response, signal)) {
			if (event.type === 'folder') {
				created = event.created;
				folderId = event.folderId;
			} else if (event.type === 'file') {
				onProgress?.(event);
			} else if (event.type === 'done') {
				result = event.result;
			} else {
				throw new Error(event.message);
			}
		}

		if (!folderId) throw new Error('Folder sync ended before the folder was identified.');
		return { created, folderId, result };
	}
}
