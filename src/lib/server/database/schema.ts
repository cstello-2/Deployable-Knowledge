import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export type Session = typeof sessions.$inferSelect;
export type SessionMessage = typeof session_messages.$inferSelect;

export type NewSession = typeof sessions.$inferInsert;
export type NewSessionMessage = typeof session_messages.$inferInsert;
