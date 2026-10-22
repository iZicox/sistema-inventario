import { Hono } from "hono";
import { Env } from "../types";
import { zValidator } from "@hono/zod-validator";
import { skuSchema } from "../validators";
import { getDb } from "../db/client";
import { errorMessage } from "../db/errors";
import { product } from "../db/schema";
import { eq } from "drizzle-orm";


const productRoute = new Hono<Env>()

// create
productRoute.post('/products', zValidator('json', skuSchema), async (c) => {
    const { sku } = c.req.valid('json')
    const db = getDb(c.env.DB)

    try {
        const [query] = await db.insert(product).values({sku}).returning()

        return c.json(query, 201)
    } catch (e) {
        if(errorMessage(e).includes('UNIQUE constraint failed')){
            return c.json({error: 'sku ya existe'}, 409)
        }

        throw e
    }
})

// list all
productRoute.get('/products', async (c) => {
    const db = getDb(c.env.DB)

    const rows = await db.select().from(product)

    return c.json(rows)
})

// list sku
productRoute.get('/products/:sku', zValidator('param', skuSchema), async (c) => {
    const { sku } = c.req.valid('param')
    const db = getDb(c.env.DB)

    const [row] = await db.select().from(product).where(eq(product.sku, sku))

    if(!row){
        return c.json({error: 'no encontrado'}, 404)
    }

    return c.json(row)
})

// delete
productRoute.delete('/products/:sku', zValidator('param', skuSchema), async (c) => {
    const { sku } = c.req.valid('param')
    const db = getDb(c.env.DB)

    try {
        const [row] = await db.delete(product).where(eq(product.sku, sku)).returning()

        if(!row){
            return c.json({error: 'no encontrado'}, 404)
        }

        return c.body(null, 204)
    } catch (e) {
        if(errorMessage(e).includes('FOREIGN KEY constraint failed')){
            return c.json({error: 'producto tiene movimientos o stock asociado'}, 409)
        }

        throw e
    }
})


export default productRoute