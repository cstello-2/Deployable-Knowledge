import { API_DOCUMENTS } from '$lib/constants';
import type {
	ApiDocumentActivationRequest,
	ApiDocumentFolderFileDeleteRequest,
	ApiDocumentFolderFileDeleteResponse,
	ApiDocumentFolderMalformedRequest,
	ApiDocumentFolderReconcileRequest,
	ApiDocumentFolderReconcileResponse,
	ApiDocumentFolderRegisterRequest,
	ApiDocumentFolderRegisterResponse,
	ApiDocumentFolderRetryResponse,
	ApiDocumentFoldersResponse,
	ApiDocumentIdsResponse,
	ApiDocumentIngestEvent,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult,
	ApiDocumentListQuery,
	ApiDocumentListResponse,
	ApiDocumentTagAssignmentRequest,
	ApiDocumentTagRequest,
	ApiDocumentTextRequest,
	ApiDocumentUrlRequest,
	ApiSyncFileStat
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

	static async ingestFile(
		file: File,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		const body = new FormData();
		body.append('file', file, file.name);
		const response = await apiStream(API_DOCUMENTS.BASE, { method: 'POST', body, signal });
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

	static registerFolder(id: string, name: string) {
		return apiPost<ApiDocumentFolderRegisterResponse, ApiDocumentFolderRegisterRequest>(
			API_DOCUMENTS.FOLDERS,
			{ id, name }
		);
	}

	static reconcileFolder(id: string, files: ApiSyncFileStat[]) {
		return apiPost<ApiDocumentFolderReconcileResponse, ApiDocumentFolderReconcileRequest>(
			API_DOCUMENTS.folderReconcile(id),
			{ files }
		);
	}

	static retryFolderMalformed(id: string) {
		return apiPost<ApiDocumentFolderRetryResponse, Record<string, never>>(
			API_DOCUMENTS.folderRetry(id),
			{}
		);
	}

	static markFolderFileMalformed(id: string, file: ApiDocumentFolderMalformedRequest) {
		return apiPost<{ marked: true }, ApiDocumentFolderMalformedRequest>(
			API_DOCUMENTS.folderMalformed(id),
			file
		);
	}

	static async uploadFolderFile(
		id: string,
		meta: ApiSyncFileStat & { replacesPath?: string },
		file: File,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<ApiDocumentIngestResult> {
		const body = new FormData();
		body.append('file', file, file.name);
		body.append('path', meta.path);
		body.append('lastModified', String(meta.lastModified));
		body.append('size', String(meta.size));
		if (meta.replacesPath) body.append('replacesPath', meta.replacesPath);
		const response = await apiStream(API_DOCUMENTS.folderFiles(id), {
			method: 'POST',
			body,
			signal
		});
		return this.readIngestStream(response, onProgress, signal);
	}

	static deleteFolderFiles(id: string, paths: string[]) {
		return apiDelete<ApiDocumentFolderFileDeleteResponse, ApiDocumentFolderFileDeleteRequest>(
			API_DOCUMENTS.folderFiles(id),
			{ paths }
		);
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
			// Hand on the progress fields alone. Passing the event through leaks its
			// `status` discriminant into callers that carry a status of their own.
			if (event.status === 'progress') {
				onProgress?.({ percent: event.percent, label: event.label, message: event.message });
			} else if (event.status === 'complete') return event.result;
			else throw new Error(event.message);
		}
		throw new Error('Document ingestion ended before completion.');
	}
}
