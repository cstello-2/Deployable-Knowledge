CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text(128) NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_provider_idx` ON `api_keys` (`provider_id`);--> statement-breakpoint
CREATE TABLE `app_state` (
	`id` text PRIMARY KEY DEFAULT 'app' NOT NULL,
	`active_profile_id` text,
	`active_layout_id` text,
	`theme_color` text DEFAULT 'classic' NOT NULL,
	`theme_mode` text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_type` text NOT NULL,
	`page_index` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`start_ms` integer,
	`end_ms` integer,
	`embedding` blob NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_chunks_document_id_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_chunk_type_idx` ON `document_chunks` (`chunk_type`);--> statement-breakpoint
CREATE INDEX `document_chunks_page_idx` ON `document_chunks` (`page_index`);--> statement-breakpoint
CREATE INDEX `document_chunks_document_chunk_idx` ON `document_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `document_tags` (
	`document_id` text NOT NULL,
	`tag` text(40) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag`) REFERENCES `tags`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_tags_unique_idx` ON `document_tags` (`document_id`,`tag`);--> statement-breakpoint
CREATE INDEX `document_tags_document_idx` ON `document_tags` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_tags_tag_idx` ON `document_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_path` text NOT NULL,
	`source_type` text NOT NULL,
	`origin` text DEFAULT 'FILE' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_source_path_idx` ON `documents` (`source_path`);--> statement-breakpoint
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notebook_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notebook_pages_notebook_idx` ON `notebook_pages` (`notebook_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `notebook_pages_updated_idx` ON `notebook_pages` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notebook_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chunk_id`) REFERENCES `document_chunks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notebook_sources_notebook_idx` ON `notebook_sources` (`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_sources_unique_idx` ON `notebook_sources` (`notebook_id`,`chunk_id`);--> statement-breakpoint
CREATE TABLE `notebook_state` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`active_notebook_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`active_page_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notebooks_sort_idx` ON `notebooks` (`sort_order`);--> statement-breakpoint
CREATE INDEX `notebooks_updated_idx` ON `notebooks` (`updated_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`provider` text(128) DEFAULT 'ollama' NOT NULL,
	`model` text(128) DEFAULT 'granite4:350m' NOT NULL,
	`max_tokens` integer DEFAULT 1024 NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`reasoning_budget` integer DEFAULT 512 NOT NULL,
	`retrieval_mode` text DEFAULT 'hybrid' NOT NULL,
	`rag_top_k` integer DEFAULT 5 NOT NULL,
	`agent_max_turns` integer DEFAULT 4 NOT NULL,
	`gpu_mode` text DEFAULT 'auto' NOT NULL,
	`enabled_tools` text DEFAULT '[]' NOT NULL,
	`prompt_template_id` text,
	`persona` text(1024),
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `profiles_updated_idx` ON `profiles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1024) DEFAULT '' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `prompt_templates_updated_idx` ON `prompt_templates` (`updated_at`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `sessions_updated_idx` ON `sessions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `synced_files` (
	`folder_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`managed_path` text,
	`document_id` text,
	`last_modified` integer NOT NULL,
	`size` integer NOT NULL,
	`state` text DEFAULT 'synced' NOT NULL,
	`message` text,
	PRIMARY KEY(`folder_id`, `relative_path`),
	FOREIGN KEY (`folder_id`) REFERENCES `synced_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_files_managed_path_idx` ON `synced_files` (`managed_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `synced_files_document_idx` ON `synced_files` (`document_id`);--> statement-breakpoint
CREATE INDEX `synced_files_state_idx` ON `synced_files` (`folder_id`,`state`);--> statement-breakpoint
CREATE TABLE `synced_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`name` text(40) PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `workspace_layouts_sort_idx` ON `workspace_layouts` (`sort_order`);