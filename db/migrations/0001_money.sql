CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`monthly_limit_cents` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `debt_payments_paid_on_idx` ON `debt_payments` (`paid_on`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starting_balance_cents` integer NOT NULL,
	`started_on` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`spent_on` text NOT NULL,
	`note` text,
	`recurring_bill_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_bill_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_spent_on_idx` ON `expenses` (`spent_on`);--> statement-breakpoint
CREATE INDEX `expenses_category_id_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_bill_due_unique` ON `expenses` (`recurring_bill_id`,`spent_on`);--> statement-breakpoint
CREATE TABLE `income` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`source` text NOT NULL,
	`received_on` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `income_received_on_idx` ON `income` (`received_on`);--> statement-breakpoint
CREATE TABLE `recurring_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`day_of_month` integer NOT NULL,
	`starts_on` text NOT NULL,
	`logged_through` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `savings_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`on_date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `savings_contributions_on_date_idx` ON `savings_contributions` (`on_date`);--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`target_date` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `categories` (`id`, `name`, `monthly_limit_cents`, `sort_order`, `archived`, `created_at`) VALUES
  ('cat-rent', 'Rent', NULL, 0, 0, '2026-10-06T00:00:00.000Z'),
  ('cat-gym', 'Gym', NULL, 1, 0, '2026-10-06T00:00:00.000Z'),
  ('cat-food', 'Food', NULL, 2, 0, '2026-10-06T00:00:00.000Z'),
  ('cat-transport', 'Transport', NULL, 3, 0, '2026-10-06T00:00:00.000Z'),
  ('cat-fun', 'Fun', NULL, 4, 0, '2026-10-06T00:00:00.000Z'),
  ('cat-other', 'Other', NULL, 5, 0, '2026-10-06T00:00:00.000Z');
