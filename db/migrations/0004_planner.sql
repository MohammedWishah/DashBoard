CREATE TABLE `day_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`day` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_tasks_user_day_position_unique` ON `day_tasks` (`user_id`,`day`,`position`);--> statement-breakpoint
CREATE INDEX `day_tasks_user_idx` ON `day_tasks` (`user_id`);--> statement-breakpoint
CREATE TABLE `habit_checks` (
	`habit_id` text NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`period` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`habit_id`, `period`),
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `habit_checks_user_idx` ON `habit_checks` (`user_id`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`frequency` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `habits_user_idx` ON `habits` (`user_id`);