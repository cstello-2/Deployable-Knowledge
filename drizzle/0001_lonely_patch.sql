ALTER TABLE `settings` ADD `retrieval_mode` text DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `rag_top_k` integer DEFAULT 5 NOT NULL;