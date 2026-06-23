<<<<<<<< HEAD:drizzle/0000_right_the_hunter.sql
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text(128) NOT NULL,
	`user_id` integer NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_provider_user_idx` ON `api_keys` (`provider_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `api_keys_user_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
========
CREATE TABLE `notebook_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notebook_pages_notebook_idx` ON `notebook_pages` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `notebook_pages_updated_idx` ON `notebook_pages` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notebook_state` (
	`user_id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`active_notebook_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`title` text NOT NULL,
	`active_page_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notebooks_user_idx` ON `notebooks` (`user_id`);--> statement-breakpoint
CREATE INDEX `notebooks_updated_idx` ON `notebooks` (`updated_at`);--> statement-breakpoint
>>>>>>>> 18a2e99 (comment fixes 2):drizzle/0000_goofy_psylocke.sql
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text(128) DEFAULT 'ollama' NOT NULL,
	`model` text(128) DEFAULT 'granite4:350m' NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`prompt_template_id` text,
	`prompt` text(1024),
	`persona` text(1024),
	`updated_at` integer,
	FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `settings_user_idx` ON `settings` (`user_id`);--> statement-breakpoint
<<<<<<<< HEAD:drizzle/0000_right_the_hunter.sql
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1024) DEFAULT '' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_templates_user_idx` ON `prompt_templates` (`user_id`);--> statement-breakpoint
CREATE INDEX `prompt_templates_updated_idx` ON `prompt_templates` (`updated_at`);--> statement-breakpoint
========
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
>>>>>>>> 18a2e99 (comment fixes 2):drizzle/0000_goofy_psylocke.sql
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
	`created_at` integer DEFAULT (unixepoch()),
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
