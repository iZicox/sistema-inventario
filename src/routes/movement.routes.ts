import { Hono } from "hono";
import { Env } from "../types";
import { zValidator } from "@hono/zod-validator";
import { createMovementSchema, idIntSchema } from "../validators";
import { getDb } from "../db/client";
import { location, movement, movementType, product, stock } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const movementRoute = new Hono<Env>()

// insert
movementRoute.post(
    '/movement', 
    zValidator('json', createMovementSchema), 
    async (c) => {
        const body = c.req.valid('json')
        const db = getDb(c.env.DB)

        const [productExist] = await db
            .select({ id: product.id })
            .from(product)
            .where(eq(product.id, body.productId))

        if(!productExist){
            return c.json({error: 'producto no existe'}, 404)
        }

        const [locationExist] = await db
            .select({ id: location.id })
            .from(location)
            .where(eq(location.id, body.locationId))

        if(!locationExist){
            return c.json({error: 'ubicacion no existe'}, 404)
        }

        const [movementRow] = await db
            .select({sign: movementType.sign})
            .from(movementType)
            .where(eq(movementType.code, body.movementTypeCode))

        if(!movementRow){
            return c.json({error: 'tipo de movimiento no existe'}, 400)
        }

        const movementEffect = body.quantity * movementRow.sign

        try {
            const [movementRows, , stockRows] = await db.batch([
                db.insert(movement)
                    .values({
                        productId: body.productId,
                        locationId: body.locationId,
                        movementTypeCode: body.movementTypeCode,
                        quantity: body.quantity,
                        note: body.note,
                    })
                    .returning(),

                // garantiza que exista la fila de stock (primer movimiento)
                db.insert(stock)
                    .values({
                        productId: body.productId,
                        locationId: body.locationId,
                        quantity: 0,
                    })
                    .onConflictDoNothing({
                        target: [stock.productId, stock.locationId],
                    }),

                // aplica el delta; si queda negativo, el CHECK aborta el batch
                db.update(stock)
                    .set({
                        quantity: sql`${stock.quantity} + ${movementEffect}`,
                        updatedAt: sql`(datetime('now'))`,
                    })
                    .where(
                        and(
                            eq(stock.productId, body.productId),
                            eq(stock.locationId, body.locationId),
                        )
                    )
                    .returning(),
            ])

            const [row] = movementRows

            if(!row){
                return c.json({error: 'error al insertar'}, 500)
            }

            return c.json({ movement: row, stock: stockRows[0] }, 201)
        } catch (e) {
            const message = e instanceof Error ? e.message : ''

            if(
                message.includes('CHECK constraint failed') ||
                message.includes('SQLITE_CONSTRAINT_CHECK')
            ){
                return c.json({error: 'stock insuficiente'}, 409)
            }

            throw e
        }
})

// list all
movementRoute.get('/movements', async (c) => {
    const db = getDb(c.env.DB)

    const rows = await db.select().from(movement)

    return c.json(rows)
})

// list id
movementRoute.get('/movements/:id',zValidator('param', idIntSchema), async (c) => {
    const db = getDb(c.env.DB)
    const { id } = c.req.valid('param')

    const [row] = await db.select().from(movement).where(eq(movement.id, id))

    if(!row){
        return c.json({error: 'no encontrado'}, 404)
    }

    return c.json(row)
})

// list por ubicacion
movementRoute.get('/movements/location/:id', zValidator('param', idIntSchema), async (c) => {
    const db = getDb(c.env.DB)
    const { id } = c.req.valid('param')

    const [locationExist] = await db
        .select({ id: location.id })
        .from(location)
        .where(eq(location.id, id))

    if(!locationExist){
        return c.json({error: 'ubicacion no existe'}, 404)
    }

    const rows = await db
        .select()
        .from(movement)
        .where(eq(movement.locationId, id))
        .orderBy(desc(movement.createdAt), desc(movement.id))

    return c.json(rows)
})

export default movementRoute
