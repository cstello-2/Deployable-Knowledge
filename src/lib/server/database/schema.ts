import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text({ length: 255 }).notNull(),
  password: text({ length: 128 }),
  salt: text({ length: 128 }),
  lastLogin: integer("last_login", { mode: "timestamp" }),
});

export const promptTemplates = sqliteTable(
  "prompt_templates",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name", { length: 255 }).notNull(),
    description: text("description", { length: 1024 }).notNull().default(""),
    systemPrompt: text("system_prompt").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [
    index("prompt_templates_user_idx").on(table.userId),
    index("prompt_templates_updated_idx").on(table.updatedAt),
  ],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id", { length: 128 }).notNull(),
    apiKey: text("api_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("api_keys_provider_idx").on(table.providerId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("local_user"),
    title: text("title").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_updated_idx").on(table.updatedAt),
  ],
);

export const session_messages = sqliteTable(
  "session_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["system", "user", "assistant", "tool"],
    }).notNull(),
    content: text("content").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<unknown | null>(),
    createdAt: integer("created_at", { mode: "timestamp" }),
  },
  (table) => [
    index("session_messages_session_idx").on(table.sessionId),
    index("session_messages_created_idx").on(table.createdAt),
  ],
);

export const notebook_state = sqliteTable("notebook_state", {
  userId: text("user_id").primaryKey().default("default"),
  activeNotebookId: text("active_notebook_id"),
  updatedAt: text("updated_at").notNull(),
});

export const notebooks = sqliteTable(
  "notebooks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    title: text("title").notNull(),
    activePageId: text("active_page_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("notebooks_user_idx").on(table.userId),
    index("notebooks_updated_idx").on(table.updatedAt),
  ],
);

export const notebook_pages = sqliteTable(
  "notebook_pages",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("notebook_pages_notebook_idx").on(table.notebookId),
    index("notebook_pages_updated_idx").on(table.updatedAt),
  ],
);

export const provider_records = sqliteTable("providers", {
  id: text("id").primaryKey(),
  apiKey: text("api_key").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id"),
  secretHash: text("secret_hash", { length: 128 }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`,
  ),
  token: text("token", { length: 255 }),
});

export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull(),
    provider: text({ length: 128 }).notNull().default("ollama"),
    model: text({ length: 128 }).notNull().default("granite4:350m"),
    maxTokens: integer("max_tokens").notNull().default(512),
    temperature: real().notNull().default(0.2),
    topK: integer("top_k").notNull().default(8),
    promptTemplateId: text("prompt_template_id").references(
      () => promptTemplates.id,
      { onDelete: "set null" },
    ),
    prompt: text({ length: 1024 }),
    persona: text({ length: 1024 }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [index("settings_user_idx").on(table.userId)],
);

export const profiles = settings;

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceType: text("source_type").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("documents_source_path_idx").on(table.sourcePath),
    index("documents_updated_at_idx").on(table.updatedAt),
  ],
);

export const document_chunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkType: text("chunk_type").notNull(),
    pageIndex: integer("page_index").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    startChar: integer("start_char"),
    endChar: integer("end_char"),
    wordCount: integer("word_count").notNull(),
    sentenceCount: integer("sentence_count").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    embedding: blob("embedding", { mode: "buffer" }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("document_chunks_document_id_idx").on(table.documentId),
    index("document_chunks_chunk_type_idx").on(table.chunkType),
    index("document_chunks_page_idx").on(table.pageIndex),
    index("document_chunks_document_chunk_idx").on(table.documentId, table.chunkIndex),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionMessage = typeof session_messages.$inferSelect;
export type NewSessionMessage = typeof session_messages.$inferInsert;

export type Notebook = typeof notebooks.$inferSelect;
export type NewNotebook = typeof notebooks.$inferInsert;

export type NotebookState = typeof notebook_state.$inferSelect;
export type NewNotebookState = typeof notebook_state.$inferInsert;

export type NotebookPage = typeof notebook_pages.$inferSelect;
export type NewNotebookPage = typeof notebook_pages.$inferInsert;

export type NotebookWithPages = Notebook & { pages: NotebookPage[] };

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SafeUser = Omit<User, "password" | "salt" | "lastLogin">;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type UserSettings = typeof settings.$inferSelect;
export type NewUserSettings = typeof settings.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type DocumentChunk = typeof document_chunks.$inferSelect;
export type NewDocumentChunk = typeof document_chunks.$inferInsert;
