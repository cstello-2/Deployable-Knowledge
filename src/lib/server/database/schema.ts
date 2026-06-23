import {
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

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id"),
  secretHash: text("secret_hash", { length: 128 }),
  createdAt: integer("created_at", { mode: "timestamp" }),
  token: text({ length: 255 }),
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

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionMessage = typeof session_messages.$inferSelect;
export type NewSessionMessage = typeof session_messages.$inferInsert;

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
