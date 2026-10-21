CREATE TABLE `location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_code_unique` ON `location` (`code`);--> statement-breakpoint
CREATE TABLE `movement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`movementTypeCode` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movementTypeCode`) REFERENCES `movement_type`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movement_product` ON `movement` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movement_location` ON `movement` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movement_type` ON `movement` (`movementTypeCode`,`created_at`);--> statement-breakpoint
CREATE TABLE `movement_type` (
	`code` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`sign` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_sku_unique` ON `product` (`sku`);--> statement-breakpoint
CREATE TABLE `stock` (
	`product_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`product_id`, `location_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
