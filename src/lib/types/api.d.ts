import type { RetrievalMode } from '$lib/enums';
import type { AgentProgressEvent } from './agent';
import type {
	AssistantProfile,
	Document,
	DocumentChunk,
	NotebookSource,
	NotebookWithPages,
	SyncedFolder
} from './database';

export interface AssistantConfig {
	provider: string;
	model: string;
	maxTokens: number;
	temperature: number;
	topK: number;
	retrievalMode: RetrievalMode;
	ragTopK: number;
	agentMaxTurns: number;
	promptTemplateId: string | null;
	persona: string;
}

export interface ApiDocumentTagRequest {
	tag: string;
}

export interface ApiDocumentTagAssignmentRequest extends ApiDocumentTagRequest {
	documentIds: string[];
	assigned: boolean;
}

export interface ApiDocumentIngestProgress {
	percent: number;
	label: string;
	message: string;
}

export interface ApiDocumentIngestResult {
	documentId: string;
	title: string;
	sourcePath: string;
	pageCount: number;
	chunkCount: number;
}

export type ApiDocumentIngestEvent =
	| ({ status: 'progress' } & ApiDocumentIngestProgress)
	| { status: 'complete'; result: ApiDocumentIngestResult }
	| { status: 'error'; message: string };

export type DocumentRow = Pick<
	Document,
	'id' | 'title' | 'sourcePath' | 'sourceType' | 'updatedAt'
> & {
	chunkCount: number;
	folderId: string | null;
	tags: string[];
};

export interface ApiDocumentListResponse {
	documents: DocumentRow[];
	tags: string[];
}

export interface ApiDocumentDirectoryItem {
	kind: 'folder' | 'pdf';
	name: string;
	path: string;
}

export interface ApiDocumentDirectoryResponse {
	items: ApiDocumentDirectoryItem[];
	parentPath: string | null;
	path: string;
}

export interface ApiDocumentFolderRequest {
	path: string;
}

export interface ApiDocumentPathRequest {
	path: string;
}

export type ApiDocumentSyncFileStatus =
	| 'queued'
	| 'ingesting'
	| 'added'
	| 'updated'
	| 'unchanged'
	| 'removed'
	| 'failed';

export interface ApiDocumentSyncFileProgress extends Partial<ApiDocumentIngestProgress> {
	sourcePath: string;
	status: ApiDocumentSyncFileStatus;
}

export interface ApiDocumentSyncResult {
	added: number;
	failed: number;
	removed: number;
	unchanged: number;
	updated: number;
}

export type ApiDocumentFolderSyncEvent =
	| { type: 'folder'; created: boolean; folderId: string }
	| ({ type: 'file' } & ApiDocumentSyncFileProgress)
	| { type: 'done'; result?: ApiDocumentSyncResult }
	| { type: 'error'; message: string };

export type ApiSyncedFolder = Pick<SyncedFolder, 'id' | 'path' | 'createdAt' | 'lastError'> & {
	watching: boolean;
};

export interface ApiDocumentFoldersResponse {
	folders: ApiSyncedFolder[];
}

export interface ApiDocumentFolderSyncResponse {
	created: boolean;
	folderId: string;
	result?: ApiDocumentSyncResult;
}

export interface ApiNotebookTitleRequest {
	title: string;
}

export interface ApiNotebookPageTitleRequest {
	title: string;
}

export interface ApiNotebookPageContentRequest {
	content: string;
}

export interface ApiNotebookSourcesRequest {
	chunk_ids: string[];
}

export interface NotebookStateResponse {
	activeNotebookId: string | null;
	notebooks: NotebookWithPages[];
}

export type NotebookSourceItem = Pick<NotebookSource, 'id' | 'chunkId' | 'createdAt'> &
	Pick<DocumentChunk, 'pageIndex'> & {
		documentTitle: Document['title'];
		preview: string;
	};

export interface ApiPromptTemplateRequest {
	name: string;
	description: string;
	systemPrompt: string;
}

export interface ApiProviderApiKeyRequest {
	apiKey: string;
}

export interface ApiProviderInfo {
	id: string;
	name: string;
	apiKeyRequired: boolean;
	hasApiKey: boolean;
}

export interface ApiProviderModelGroup extends Pick<ApiProviderInfo, 'id' | 'name'> {
	models: string[];
}

export interface ApiSessionTitleRequest {
	title: string;
}

export interface ApiEmbeddingModelStatus {
	installed: boolean;
	model: string;
	dtype: string;
}

export type ApiEmbeddingModelInstallEvent =
	| { status: 'progress'; progress: number; loaded: number; total: number }
	| { status: 'ready' }
	| { status: 'error'; message: string };

interface ApiChatMessageBase {
	message: string;
	model_id: string;
	provider_id: string;
	max_tokens: number;
	temperature: number;
	top_k: number;
	agent_max_turns: number;
	tools_enabled?: boolean;
}

export interface ApiDocumentChatMessageRequest extends ApiChatMessageBase {
	conversational: false;
	prompt_template_id: string | null;
	persona: string;
	document_ids: string[];
	rag_top_k: number;
}

export interface ApiNotebookChatMessageRequest extends ApiChatMessageBase {
	conversational: true;
	context: string;
	notebook_id: string | null;
}

export type ApiChatMessageRequest = ApiDocumentChatMessageRequest | ApiNotebookChatMessageRequest;

export type ApiChatStreamEvent =
	| { type: 'agent'; progress: AgentProgressEvent }
	| { type: 'text'; delta: string }
	| { type: 'text-reset' }
	| { type: 'title'; title: string }
	| {
			type: 'complete';
			modelTurns: number;
			toolTurns: number;
			toolCalls: number;
			contextItems: number;
	  }
	| { type: 'error'; message: string };

export interface ApiSearchMatch {
	chunkId: string;
	documentId: string;
	sourceTitle: string;
	pageIndex: number;
	content: string;
}

export type ApiSearchResults = Record<RetrievalMode, ApiSearchMatch[]>;

export type ApiActiveAssistantProfile = AssistantProfile | null;
