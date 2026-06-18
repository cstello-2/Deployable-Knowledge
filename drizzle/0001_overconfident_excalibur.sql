CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_type` text NOT NULL,
	`page_index` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`start_char` integer,
	`end_char` integer,
	`word_count` integer NOT NULL,
	`sentence_count` integer NOT NULL,
	`metadata` text,
	`embedding` blob NOT NULL,
	`embedding_model` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);


CREATE INDEX `document_chunks_document_id_idx` ON `document_chunks` (`document_id`);
CREATE INDEX `document_chunks_chunk_type_idx` ON `document_chunks` (`chunk_type`);
CREATE INDEX `document_chunks_page_idx` ON `document_chunks` (`page_index`);
CREATE INDEX `document_chunks_document_chunk_idx` ON `document_chunks` (`document_id`,`chunk_index`);
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_path` text NOT NULL,
	`source_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE INDEX `documents_source_path_idx` ON `documents` (`source_path`);
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);