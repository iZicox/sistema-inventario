import {
    sqliteTable,
    text,
    integer,
    primaryKey,
    index,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// movement_type — catálogo de tipos. Extensible por INSERT.
// ─────────────────────────────────────────────────────────────
export const movementType = sqliteTable('movement_type', {
    code: text('code').primaryKey(),                    // 'ENTRY', 'EXIT', ...
    description: text('description').notNull(),
    sign: integer('sign').notNull(),                    // 1 = suma, -1 = resta
    createdAt: text('created_at')
        .notNull()
        .default(sql`(datetime('now'))`),
});

// ─────────────────────────────────────────────────────────────
// location — en MVP solo existe 'WAREHOUSE'.
// ─────────────────────────────────────────────────────────────
export const location = sqliteTable('location', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(datetime('now'))`),
});

// ─────────────────────────────────────────────────────────────
// product — catálogo mínimo.
// ─────────────────────────────────────────────────────────────
export const product = sqliteTable('product', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sku: text('sku').notNull().unique(),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
        .notNull()
        .default(sql`(datetime('now'))`),
});

// ─────────────────────────────────────────────────────────────
// movement — historial inmutable (append-only).
// type es FK a movement_type.code.
// ─────────────────────────────────────────────────────────────
export const movement = sqliteTable(
    'movement',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        productId: integer('product_id')
            .notNull()
            .references(() => product.id),
        locationId: integer('location_id')
            .notNull()
            .references(() => location.id),
        movementTypeCode: text('movementTypeCode')
            .notNull()
            .references(() => movementType.code),
        quantity: integer('quantity').notNull(),
        note: text('note'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(datetime('now'))`),
    },
    (table) => [
        index('idx_movement_product').on(table.productId, table.createdAt),
        index('idx_movement_location').on(table.locationId, table.createdAt),
        index('idx_movement_type').on(table.movementTypeCode, table.createdAt),
    ]
);

// ─────────────────────────────────────────────────────────────
// stock — proyección por (product_id, location_id).
// El CHECK es el árbitro que aborta el batch en D1.
// ─────────────────────────────────────────────────────────────
export const stock = sqliteTable(
    'stock',
    {
        productId: integer('product_id')
            .notNull()
            .references(() => product.id),
        locationId: integer('location_id')
            .notNull()
            .references(() => location.id),
        quantity: integer('quantity').notNull().default(0),
        updatedAt: text('updated_at')
            .notNull()
            .default(sql`(datetime('now'))`),
    },
    (table) => [
        primaryKey({ columns: [table.productId, table.locationId] }),
    ]
);