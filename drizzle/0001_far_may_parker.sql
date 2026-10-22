PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stock` (
	`product_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`product_id`, `location_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_quantity_non_negative" CHECK("__new_stock"."quantity" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_stock`("product_id", "location_id", "quantity", "updated_at") SELECT "product_id", "location_id", "quantity", "updated_at" FROM `stock`;--> statement-breakpoint
DROP TABLE `stock`;--> statement-breakpoint
ALTER TABLE `__new_stock` RENAME TO `stock`;--> statement-breakpoint
PRAGMA foreign_keys=ON;