import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import {
	DEFAULT_ASSISTANT_CONFIG,
	DEFAULT_THEME,
	LAYOUT_NAME_MAX_LENGTH,
	THEME_COLORS,
	THEME_MODES
} from '$lib/constants';
import type { WorkspaceLayoutSnapshot } from '$lib/types/workspace';

export const appState = sqliteTable('app_state', {
	id: text('id').primaryKey().default('app'),
	activeProfileId: text('active_profile_id'),
	activeLayoutId: text('active_layout_id'),
	themeColor: text('theme_color', { enum: THEME_COLORS }).notNull().default(DEFAULT_THEME.color),
	themeMode: text('theme_mode', { enum: THEME_MODES }).notNull().default(DEFAULT_THEME.mode)
});

// Workspace layout tabs. The snapshot is opaque UI state that is always read and
// written whole, so it lives in a single JSON column rather than a child table.
export const workspaceLayouts = sqliteTable(
	'workspace_layouts',
	{
		id: text('id').primaryKey(),
		name: text('name', { length: LAYOUT_NAME_MAX_LENGTH }).notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		snapshot: text('snapshot', { mode: 'json' }).$type<WorkspaceLayoutSnapshot>().notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [index('workspace_layouts_sort_idx').on(table.sortOrder)]
);

export const promptTemplates = sqliteTable(
	'prompt_templates',
	{
		id: text('id').primaryKey(),
		name: text('name', { length: 255 }).notNull(),
		description: text('description', { length: 1024 }).notNull().default(''),
		systemPrompt: text('system_prompt').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [index('prompt_templates_updated_idx').on(table.updatedAt)]
);

export const apiKeys = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey(),
		providerId: text('provider_id', { length: 128 }).notNull(),
		apiKey: text('api_key').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [uniqueIndex('api_keys_provider_idx').on(table.providerId)]
);

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [index('sessions_updated_idx').on(table.updatedAt)]
);

export const sessionMessages = sqliteTable(
	'session_messages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		role: text('role', {
			enum: ['system', 'user', 'assistant', 'tool']
		}).notNull(),
		content: text('content').notNull(),
		metadata: text('metadata', { mode: 'json' }).$type<unknown | null>(),
		createdAt: integer('created_at', { mode: 'timestamp' })
	},
	(table) => [
		index('session_messages_session_idx').on(table.sessionId),
		index('session_messages_created_idx').on(table.createdAt)
	]
);

export const notebookState = sqliteTable('notebook_state', {
	id: text('id').primaryKey().default('default'),
	activeNotebookId: text('active_notebook_id'),
	updatedAt: text('updated_at').notNull()
});

export const notebooks = sqliteTable(
	'notebooks',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		activePageId: text('active_page_id'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		index('notebooks_sort_idx').on(table.sortOrder),
		index('notebooks_updated_idx').on(table.updatedAt)
	]
);

export const notebookPages = sqliteTable(
	'notebook_pages',
	{
		id: text('id').primaryKey(),
		notebookId: text('notebook_id')
			.notNull()
			.references(() => notebooks.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		content: text('content').notNull().default(''),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		index('notebook_pages_notebook_idx').on(table.notebookId, table.sortOrder),
		index('notebook_pages_updated_idx').on(table.updatedAt)
	]
);

// Chunks attached to a notebook via "Send to Notebook" — hidden from the
// notebook page text itself, but available server-side so notebook-mode chat
// can use them as context without exposing raw source excerpts to the user.
export const notebookSources = sqliteTable(
	'notebook_sources',
	{
		id: text('id').primaryKey(),
		notebookId: text('notebook_id')
			.notNull()
			.references(() => notebooks.id, { onDelete: 'cascade' }),
		chunkId: text('chunk_id')
			.notNull()
			.references(() => documentChunks.id, { onDelete: 'cascade' }),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		index('notebook_sources_notebook_idx').on(table.notebookId),
		uniqueIndex('notebook_sources_unique_idx').on(table.notebookId, table.chunkId)
	]
);

export const providerRecords = sqliteTable('providers', {
	id: text('id').primaryKey(),
	apiKey: text('api_key').notNull().default(''),
	updatedAt: text('updated_at').notNull()
});

export const profiles = sqliteTable(
	'profiles',
	{
		id: text('id').primaryKey(),
		name: text('name', { length: 255 }).notNull(),
		provider: text({ length: 128 }).notNull().default(DEFAULT_ASSISTANT_CONFIG.provider),
		model: text({ length: 128 }).notNull().default(DEFAULT_ASSISTANT_CONFIG.model),
		maxTokens: integer('max_tokens').notNull().default(DEFAULT_ASSISTANT_CONFIG.maxTokens),
		temperature: real().notNull().default(DEFAULT_ASSISTANT_CONFIG.temperature),
		topK: integer('top_k').notNull().default(DEFAULT_ASSISTANT_CONFIG.topK),
		reasoningBudget: integer('reasoning_budget')
			.notNull()
			.default(DEFAULT_ASSISTANT_CONFIG.reasoningBudget),
		retrievalMode: text('retrieval_mode', {
			enum: ['semantic', 'bm25', 'hybrid']
		})
			.notNull()
			.default(DEFAULT_ASSISTANT_CONFIG.retrievalMode),
		ragTopK: integer('rag_top_k').notNull().default(DEFAULT_ASSISTANT_CONFIG.ragTopK),
		agentMaxTurns: integer('agent_max_turns')
			.notNull()
			.default(DEFAULT_ASSISTANT_CONFIG.agentMaxTurns),
		contextSize: integer('context_size'),
		gpuMode: text('gpu_mode', { enum: ['auto', 'cpu', 'cuda', 'vulkan'] })
			.notNull()
			.default(DEFAULT_ASSISTANT_CONFIG.gpuMode),
		enabledTools: text('enabled_tools', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(DEFAULT_ASSISTANT_CONFIG.enabledTools),
		promptTemplateId: text('prompt_template_id').references(() => promptTemplates.id, {
			onDelete: 'set null'
		}),
		persona: text({ length: 1024 }),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [index('profiles_updated_idx').on(table.updatedAt)]
);

export const documents = sqliteTable(
	'documents',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		sourcePath: text('source_path').notNull(),
		sourceType: text('source_type', {
			enum: ['PDF', 'AUDIO', 'DOCX', 'PPTX', 'XLSX', 'CSV', 'TEXT', 'YOUTUBE']
		}).notNull(),
		// FILE documents come from disk (upload or folder sync); MANUAL documents
		// are text embedded directly through the UI and only exist as managed copies.
		origin: text('origin', { enum: ['FILE', 'MANUAL'] })
			.notNull()
			.default('FILE'),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		index('documents_source_path_idx').on(table.sourcePath),
		index('documents_updated_at_idx').on(table.updatedAt)
	]
);

export const tags = sqliteTable('tags', {
	name: text('name', { length: 40 }).primaryKey(),
	createdAt: text('created_at').notNull()
});

export const documentTags = sqliteTable(
	'document_tags',
	{
		documentId: text('document_id')
			.notNull()
			.references(() => documents.id, { onDelete: 'cascade' }),
		tag: text('tag', { length: 40 })
			.notNull()
			.references(() => tags.name, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('document_tags_unique_idx').on(table.documentId, table.tag),
		index('document_tags_document_idx').on(table.documentId),
		index('document_tags_tag_idx').on(table.tag)
	]
);

export const documentChunks = sqliteTable(
	'document_chunks',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => documents.id, { onDelete: 'cascade' }),
		chunkType: text('chunk_type', {
			enum: ['TEXT', 'IMAGE', 'TABLE']
		}).notNull(),
		pageIndex: integer('page_index').notNull(),
		chunkIndex: integer('chunk_index').notNull(),
		content: text('content').notNull(),
		startMs: integer('start_ms'),
		endMs: integer('end_ms'),
		embedding: blob('embedding', { mode: 'buffer' }).notNull(),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		index('document_chunks_document_id_idx').on(table.documentId),
		index('document_chunks_chunk_type_idx').on(table.chunkType),
		index('document_chunks_page_idx').on(table.pageIndex),
		index('document_chunks_document_chunk_idx').on(table.documentId, table.chunkIndex)
	]
);

export const syncedFolders = sqliteTable(
	'synced_folders',
	{
		id: text('id').primaryKey(),
		path: text('path').notNull(),
		createdAt: text('created_at').notNull(),
		lastError: text('last_error')
	},
	(table) => [uniqueIndex('synced_folders_path_idx').on(table.path)]
);

export const syncedFiles = sqliteTable(
	'synced_files',
	{
		sourcePath: text('source_path').primaryKey(),
		folderId: text('folder_id')
			.notNull()
			.references(() => syncedFolders.id, { onDelete: 'cascade' }),
		managedPath: text('managed_path').notNull(),
		documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
		mtimeMs: integer('mtime_ms').notNull(),
		size: integer('size').notNull(),
		ignored: integer('ignored', { mode: 'boolean' }).notNull().default(false)
	},
	(table) => [
		index('synced_files_folder_idx').on(table.folderId),
		uniqueIndex('synced_files_managed_path_idx').on(table.managedPath),
		uniqueIndex('synced_files_document_idx').on(table.documentId)
	]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionMessage = typeof sessionMessages.$inferSelect;
export type NewSessionMessage = typeof sessionMessages.$inferInsert;

export type Notebook = typeof notebooks.$inferSelect;
export type NewNotebook = typeof notebooks.$inferInsert;

export type NotebookState = typeof notebookState.$inferSelect;
export type NewNotebookState = typeof notebookState.$inferInsert;

export type NotebookPage = typeof notebookPages.$inferSelect;
export type NewNotebookPage = typeof notebookPages.$inferInsert;

export type NotebookWithPages = Notebook & { pages: NotebookPage[] };

export type NotebookSource = typeof notebookSources.$inferSelect;
export type NewNotebookSource = typeof notebookSources.$inferInsert;

export type AppState = typeof appState.$inferSelect;
export type NewAppState = typeof appState.$inferInsert;

export type WorkspaceLayout = typeof workspaceLayouts.$inferSelect;
export type NewWorkspaceLayout = typeof workspaceLayouts.$inferInsert;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type DocumentTag = typeof documentTags.$inferSelect;
export type NewDocumentTag = typeof documentTags.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

export type SyncedFolder = typeof syncedFolders.$inferSelect;
export type NewSyncedFolder = typeof syncedFolders.$inferInsert;

export type SyncedFile = typeof syncedFiles.$inferSelect;
export type NewSyncedFile = typeof syncedFiles.$inferInsert;

export type AssistantProfile = typeof profiles.$inferSelect;
export type NewAssistantProfile = typeof profiles.$inferInsert;

// Helper types
export type AssistantProfileValues = Pick<
	AssistantProfile,
	| 'provider'
	| 'model'
	| 'maxTokens'
	| 'temperature'
	| 'topK'
	| 'reasoningBudget'
	| 'retrievalMode'
	| 'ragTopK'
	| 'agentMaxTurns'
	| 'contextSize'
	| 'gpuMode'
	| 'enabledTools'
	| 'promptTemplateId'
	| 'persona'
>;

export type ActiveAssistantProfile = AssistantProfile | null;
export type AssistantProfileCreateValues = AssistantProfileValues & Pick<AssistantProfile, 'name'>;

export type AssistantProfileUpdateValues = AssistantProfileValues &
	Partial<Pick<AssistantProfile, 'name'>>;

export type AssistantProfileListResponse = {
	profiles: AssistantProfile[];
	activeProfileId: string | null;
};

export type AssistantProfileActivationResponse = {
	profile: AssistantProfile;
	activeProfileId: AssistantProfile['id'];
};

export type PromptTemplateFormValue = Pick<
	PromptTemplate,
	'name' | 'description' | 'systemPrompt'
> &
	Partial<Pick<PromptTemplate, 'id'>>;
