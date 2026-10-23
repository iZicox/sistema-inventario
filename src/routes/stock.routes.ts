import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { Env } from "../types";
import { getDb } from "../db/client";
import { location, product, stock } from "../db/schema";
import { idIntSchema, productLocationSchema, stockQuerySchema } from "../validators";

const stockRoute = new Hono<Env>()

// campos comunes de los listados de stock
const stockRowSelect = {
    productId: stock.productId,
    sku: product.sku,
    locationId: stock.locationId,
    locationCode: location.code,
    quantity: stock.quantity,
    updatedAt: stock.updatedAt,
}

// listar todo el stock (con filtros opcionales por producto y ubicación)
stockRoute.get('/stock', zValidator('query', stockQuerySchema), async (c) => {
    const { productId, locationId } = c.req.valid('query')
    const db = getDb(c.env.DB)

    // aplica solo los filtros recibidos
    const conditions = []
    if (productId !== undefined) conditions.push(eq(stock.productId, productId))
    if (locationId !== undefined) conditions.push(eq(stock.locationId, locationId))

    // une producto y ubicacion; resultado: array de filas
    const rows = await db
        .select(stockRowSelect)
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(location, eq(stock.locationId, location.id))
        .where(and(...conditions))
        .orderBy(asc(product.sku), asc(location.code))

    return c.json(rows)
})

// stock de un producto en todas sus ubicaciones
stockRoute.get('/stock/product/:id', zValidator('param', idIntSchema), async (c) => {
    const { id } = c.req.valid('param')
    const db = getDb(c.env.DB)

    // verifica el producto; resultado: una fila o undefined
    const [productRow] = await db
        .select({ id: product.id, sku: product.sku })
        .from(product)
        .where(eq(product.id, id))

    if(!productRow){
        return c.json({error: 'producto no existe'}, 404)
    }

    // stock del producto en cada ubicacion; resultado: array
    const rows = await db
        .select({
            locationId: stock.locationId,
            locationCode: location.code,
            quantity: stock.quantity,
            updatedAt: stock.updatedAt,
        })
        .from(stock)
        .innerJoin(location, eq(stock.locationId, location.id))
        .where(eq(stock.productId, id))
        .orderBy(asc(location.code))

    // suma las cantidades de todas las ubicaciones
    const total = rows.reduce((sum, row) => sum + row.quantity, 0)

    return c.json({
        productId: productRow.id,
        sku: productRow.sku,
        total,
        locations: rows,
    })
})

// stock de todos los productos en una ubicación
stockRoute.get('/stock/location/:id', zValidator('param', idIntSchema), async (c) => {
    const { id } = c.req.valid('param')
    const db = getDb(c.env.DB)

    // verifica la ubicacion; resultado: una fila o undefined
    const [locationRow] = await db
        .select({ id: location.id, code: location.code })
        .from(location)
        .where(eq(location.id, id))

    if(!locationRow){
        return c.json({error: 'ubicacion no existe'}, 404)
    }

    // productos con stock en esa ubicacion; resultado: array
    const rows = await db
        .select({
            productId: stock.productId,
            sku: product.sku,
            quantity: stock.quantity,
            updatedAt: stock.updatedAt,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .where(eq(stock.locationId, id))
        .orderBy(asc(product.sku))

    // suma las cantidades de todos los productos
    const total = rows.reduce((sum, row) => sum + row.quantity, 0)

    return c.json({
        locationId: locationRow.id,
        code: locationRow.code,
        total,
        products: rows,
    })
})

// stock de un producto en una ubicación concreta
stockRoute.get('/stock/:productId/:locationId', zValidator('param', productLocationSchema), async (c) => {
    const { productId, locationId } = c.req.valid('param')
    const db = getDb(c.env.DB)

    // verifica el producto; resultado: una fila o undefined
    const [productRow] = await db
        .select({ id: product.id, sku: product.sku })
        .from(product)
        .where(eq(product.id, productId))

    if(!productRow){
        return c.json({error: 'producto no existe'}, 404)
    }

    // verifica la ubicacion; resultado: una fila o undefined
    const [locationRow] = await db
        .select({ id: location.id, code: location.code })
        .from(location)
        .where(eq(location.id, locationId))

    if(!locationRow){
        return c.json({error: 'ubicacion no existe'}, 404)
    }

    // busca la fila exacta de stock; resultado: una fila o undefined
    const [row] = await db
        .select({
            quantity: stock.quantity,
            updatedAt: stock.updatedAt,
        })
        .from(stock)
        .where(
            and(
                eq(stock.productId, productId),
                eq(stock.locationId, locationId),
            )
        )

    // si no hay fila devuelve cero, porque producto y ubicacion si existen
    return c.json({
        productId: productRow.id,
        sku: productRow.sku,
        locationId: locationRow.id,
        locationCode: locationRow.code,
        quantity: row?.quantity ?? 0,
        updatedAt: row?.updatedAt ?? null,
    })
})

// reconstruye el stock desde el historial de movimientos
stockRoute.post('/stock/recalculate', async (c) => {
    // el batch es atomico; resultado: array con el estado de cada sentencia
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM stock'),
        // suma los movimientos usando el signo de su tipo
        c.env.DB.prepare(`
            INSERT INTO stock (product_id, location_id, quantity, updated_at)
            SELECT
                m.product_id,
                m.location_id,
                SUM(m.quantity * mt.sign),
                datetime('now')
            FROM movement m
            INNER JOIN movement_type mt ON mt.code = m.movementTypeCode
            GROUP BY m.product_id, m.location_id
        `),
    ])

    const db = getDb(c.env.DB)

    // devuelve el stock ya reconstruido; resultado: array de filas
    const rows = await db
        .select(stockRowSelect)
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(location, eq(stock.locationId, location.id))
        .orderBy(asc(product.sku), asc(location.code))

    return c.json({
        recalculated: rows.length,
        stock: rows,
    })
})

export default stockRoute
