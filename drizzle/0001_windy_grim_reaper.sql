CREATE TABLE `assistant_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`prompt_template_id` text DEFAULT 'rag_chat' NOT NULL,
	`provider_id` text DEFAULT 'ollama' NOT NULL,
	`model_id` text DEFAULT 'granite4:350m' NOT NULL,
	`persona_id` text,
	`persona_text` text,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_profiles_user_idx` ON `assistant_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `assistant_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`provider_id` text DEFAULT 'ollama' NOT NULL,
	`model_id` text DEFAULT 'granite4:350m' NOT NULL,
	`prompt_template_id` text DEFAULT 'rag_chat' NOT NULL,
	`persona_id` text,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_settings_user_idx` ON `assistant_settings` (`user_id`);--> statement-breakpoint
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
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personas_user_idx` ON `personas` (`user_id`);--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`system` text DEFAULT '' NOT NULL,
	`include_history` integer DEFAULT true NOT NULL,
	`temperature` real,
	`top_k` integer,
	`max_tokens` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prompt_templates_user_idx` ON `prompt_templates` (`user_id`);