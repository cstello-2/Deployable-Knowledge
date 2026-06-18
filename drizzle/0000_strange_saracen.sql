CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text(128) DEFAULT 'ollama' NOT NULL,
	`model` text(128) DEFAULT 'granite4:350m' NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`prompt` text(1024),
	`persona` text(1024),
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `settings_user_idx` ON `settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_messages_session_idx` ON `session_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_messages_created_idx` ON `session_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'local_user' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_updated_idx` ON `sessions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`secret_hash` text(128),
	`created_at` integer,
	`token` text(255)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text(255) NOT NULL,
	`password` text(128),
	`salt` text(128),
	`last_login` integer
);
