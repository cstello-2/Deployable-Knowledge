import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    title: text("title").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
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
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("session_messages_session_idx").on(table.sessionId),
    index("session_messages_created_idx").on(table.createdAt),
  ],
);

export const assistant_settings = sqliteTable(
  "assistant_settings",
  {
    id: text("id").primaryKey().default("default"),
    userId: text("user_id").notNull().default("default"),

    providerId: text("provider_id").notNull().default("ollama"),
    modelId: text("model_id").notNull().default("granite4:350m"),

    promptTemplateId: text("prompt_template_id").notNull().default("rag_chat"),
    personaId: text("persona_id"),

    temperature: real("temperature").notNull().default(0.2),
    topK: integer("top_k").notNull().default(8),
    maxTokens: integer("max_tokens").notNull().default(512),

    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("assistant_settings_user_idx").on(table.userId)],
);

export const prompt_templates = sqliteTable(
  "prompt_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),

    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    system: text("system").notNull().default(""),
    includeHistory: integer("include_history", { mode: "boolean" })
      .notNull()
      .default(true),

    temperature: real("temperature"),
    topK: integer("top_k"),
    maxTokens: integer("max_tokens"),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("prompt_templates_user_idx").on(table.userId)],
);

export const personas = sqliteTable(
  "personas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),

    name: text("name").notNull(),
    text: text("text").notNull().default(""),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("personas_user_idx").on(table.userId)],
);

export const assistant_profiles = sqliteTable(
  "assistant_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),

    name: text("name").notNull(),

    promptTemplateId: text("prompt_template_id").notNull().default("rag_chat"),
    providerId: text("provider_id").notNull().default("ollama"),
    modelId: text("model_id").notNull().default("granite4:350m"),

    personaId: text("persona_id"),
    personaText: text("persona_text"),

    temperature: real("temperature").notNull().default(0.2),
    topK: integer("top_k").notNull().default(8),
    maxTokens: integer("max_tokens").notNull().default(512),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("assistant_profiles_user_idx").on(table.userId)],
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

export type Session = typeof sessions.$inferSelect;
export type SessionMessage = typeof session_messages.$inferSelect;

export type NewSession = typeof sessions.$inferInsert;
export type NewSessionMessage = typeof session_messages.$inferInsert;

export type AssistantSettings = typeof assistant_settings.$inferSelect;
export type PromptTemplate = typeof prompt_templates.$inferSelect;
export type Persona = typeof personas.$inferSelect;
export type AssistantProfile = typeof assistant_profiles.$inferSelect;
export type NotebookState = typeof notebook_state.$inferSelect;
export type Notebook = typeof notebooks.$inferSelect;
export type NotebookPage = typeof notebook_pages.$inferSelect;
export type ProviderRecord = typeof provider_records.$inferSelect;