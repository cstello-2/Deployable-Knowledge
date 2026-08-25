CREATE TABLE `workspace_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `workspace_layouts_sort_idx` ON `workspace_layouts` (`sort_order`);--> statement-breakpoint
ALTER TABLE `app_state` ADD `active_layout_id` text;--> statement-breakpoint
ALTER TABLE `app_state` ADD `theme_color` text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE `app_state` ADD `theme_mode` text DEFAULT 'system' NOT NULL;