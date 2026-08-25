import type { ThemeColor, ThemeMode } from '$lib/constants/theme-defaults';
import type { RetrievalMode } from '$lib/enums';
import type { AgentGoal, AgentProgressEvent } from './agent';
import type {
	AssistantProfile,
	Document,
	DocumentChunk,
	NotebookSource,
	NotebookWithPages,
	SyncedFolder,
	WorkspaceLayout
} from './database';
import type { WorkspaceLayoutSnapshot } from './workspace';

export type LlamaGpuMode = 'auto' | 'cpu' | 'cuda' | 'vulkan';

export interface AssistantConfig {
	provider: string;
	model: string;
	maxTokens: number;
	temperature: number;
	topK: number;
	reasoningBudget: number;
	retrievalMode: RetrievalMode;
	ragTopK: number;
	agentMaxTurns: number;
	contextSize: number | null;
	gpuMode: LlamaGpuMode;
	promptTemplateId: string | null;
	persona: string;
	enabledTools: string[];
}

export type ChatMode = 'document' | 'notebook';

export interface ApiAgentTool {
	id: string;
	label: string;
	description: string;
	modes: readonly ChatMode[];
}

export interface ApiDocumentTagRequest {
	tag: string;
}

export interface ApiDocumentTagAssignmentRequest extends ApiDocumentTagRequest {
	documentIds: string[];
	assigned: boolean;
}

export interface ApiDocumentActivationRequest {
	active: boolean;
	documentIds?: string[];
}

export interface ApiDocumentTextRequest {
	title: string;
	text: string;
}

export interface ApiDocumentUrlRequest {
	url: string;
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
	'id' | 'title' | 'sourcePath' | 'sourceType' | 'origin' | 'createdAt' | 'updatedAt' | 'active'
> & {
	chunkCount: number;
	folderId: string | null;
	tags: string[];
};

export type DocumentListMode = 'all' | 'active' | 'inactive';

export type SortDirection = 'asc' | 'desc';

export type DocumentSortMode =
	| 'title-asc'
	| 'title-desc'
	| 'oldest'
	| 'newest'
	| 'most-chunks'
	| 'least-chunks';

export interface ApiDocumentListQuery {
	limit?: number;
	mode?: DocumentListMode;
	offset?: number;
	query?: string;
	sort?: DocumentSortMode;
	tags?: string[];
}

export interface ApiFolderDocumentCount {
	folderId: string | null;
	total: number;
}

export interface ApiDocumentListResponse {
	documents: DocumentRow[];
	folderCounts: ApiFolderDocumentCount[];
	manualTotal: number;
	tags: string[];
	total: number;
}

export interface ApiDocumentIdsResponse {
	ids: string[];
}

export type TranscriptChunkRow = Pick<
	DocumentChunk,
	'id' | 'chunkIndex' | 'content' | 'startMs' | 'endMs'
>;

export interface ApiTranscriptResponse {
	chunks: TranscriptChunkRow[];
	document: Pick<Document, 'id' | 'title' | 'sourcePath' | 'sourceType' | 'updatedAt'>;
}

export interface ApiDocumentDirectoryItem {
	kind: 'folder' | 'pdf' | 'audio' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'text' | 'youtube';
	name: string;
	path: string;
}

export interface ApiDocumentDirectoryQuery {
	limit?: number;
	offset?: number;
	path?: string;
	sort?: SortDirection;
}

export interface ApiDocumentDirectoryResponse {
	items: ApiDocumentDirectoryItem[];
	parentPath: string | null;
	path: string;
	total: number;
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

export interface ApiNotebookPageMoveRequest {
	destinationNotebookId: string;
}

export interface ApiReorderRequest {
	orderedIds: string[];
}

export interface ApiReorderResponse {
	ok: true;
}

export interface ApiNotebookSourcesRequest {
	chunk_ids: string[];
}

export interface ThemeSettings {
	color: ThemeColor;
	mode: ThemeMode;
}

export interface ApiWorkspaceLayoutCreateRequest {
	name?: string;
	snapshot: WorkspaceLayoutSnapshot;
}

export interface ApiWorkspaceLayoutUpdateRequest {
	name?: string;
	snapshot?: WorkspaceLayoutSnapshot;
}

export interface WorkspaceLayoutStateResponse {
	activeLayoutId: string;
	layouts: WorkspaceLayout[];
}

export interface NotebookStateResponse {
	activeNotebookId: string | null;
	notebooks: NotebookWithPages[];
}

export type NotebookSourceItem = Pick<NotebookSource, 'id' | 'chunkId' | 'createdAt'> &
	Pick<DocumentChunk, 'pageIndex'> & {
		documentId: Document['id'];
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

export interface ApiProviderModelCapabilities {
	model: string;
	tools: boolean;
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

export interface ApiLocalModelInfo {
	fileName: string;
	sizeBytes: number | null;
	downloaded: boolean;
	trainContextSize: number | null;
}

export interface ApiLocalModelsStatus {
	models: ApiLocalModelInfo[];
	downloadingFile: string | null;
	gpu: { supported: Exclude<LlamaGpuMode, 'auto' | 'cpu'>[] };
}

export interface ApiLocalModelDownloadRequest {
	fileName: string;
}

export type ApiLocalModelDownloadEvent =
	| { status: 'progress'; progress: number; loaded: number; total: number }
	| { status: 'ready'; fileName: string }
	| { status: 'error'; message: string };

interface ApiChatMessageBase {
	message: string;
	model_id: string;
	provider_id: string;
	max_tokens: number;
	temperature: number;
	top_k: number;
	reasoning_budget?: number;
	agent_max_turns: number;
	tools_enabled?: boolean;
	enabled_tools?: string[];
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

export interface ApiNotebookCollectionImportRequest {
	path: string;
}

export interface ApiNotebookMarkdownImportRequest {
	path: string;
}

export type ApiChatMessageRequest = ApiDocumentChatMessageRequest | ApiNotebookChatMessageRequest;

export type ApiChatStreamEvent =
	| { type: 'agent'; progress: AgentProgressEvent }
	| { type: 'text'; delta: string }
	| { type: 'text-reset' }
	| { type: 'goals'; goals: AgentGoal[] }
	| { type: 'title'; title: string }
	| {
			type: 'complete';
			modelTurns: number;
			toolTurns: number;
			toolCalls: number;
			contextItems: number;
			saved?: boolean;
	  }
	| { type: 'error'; message: string };

export interface ApiSearchMatch {
	chunkId: string;
	documentId: string;
	sourceTitle: string;
	sourceType: Document['sourceType'];
	pageIndex: number;
	chunkIndex: number;
	content: string;
}

export type ApiSearchResults = Record<RetrievalMode, ApiSearchMatch[]>;

export type ApiActiveAssistantProfile = AssistantProfile | null;
