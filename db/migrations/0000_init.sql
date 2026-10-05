CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`next_action` text NOT NULL,
	`done_definition` text DEFAULT '' NOT NULL,
	`last_touched` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipped_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`note` text,
	`shipped_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shipped_events_shipped_at_idx` ON `shipped_events` (`shipped_at`);--> statement-breakpoint
CREATE INDEX `shipped_events_project_id_idx` ON `shipped_events` (`project_id`);