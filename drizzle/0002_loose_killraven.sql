PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_movement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`movementTypeCode` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movementTypeCode`) REFERENCES `movement_type`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "movement_quantity_positive" CHECK("__new_movement"."quantity" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_movement`("id", "product_id", "location_id", "movementTypeCode", "quantity", "note", "created_at") SELECT "id", "product_id", "location_id", "movementTypeCode", "quantity", "note", "created_at" FROM `movement`;--> statement-breakpoint
DROP TABLE `movement`;--> statement-breakpoint
ALTER TABLE `__new_movement` RENAME TO `movement`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_movement_product` ON `movement` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movement_location` ON `movement` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movement_type` ON `movement` (`movementTypeCode`,`created_at`);