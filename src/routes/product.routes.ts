import { Hono } from "hono";
import { Env } from "../types";
import { zValidator } from "@hono/zod-validator";
import { skuSchema } from "../validators";
import { getDb } from "../db/client";
import { product } from "../db/schema";
import { eq } from "drizzle-orm";


const productRoute = new Hono<Env>()

// create
productRoute.post('/products', zValidator('json', skuSchema), async (c) => {
    const { sku } = c.req.valid('json')
    const db = getDb(c.env.DB)

    const [query] = await db.insert(product).values({sku}).returning()

    return c.json(query, 201)

})

// list all
productRoute.get('/products', async (c) => {
    const db = getDb(c.env.DB)

    const rows = await db.select().from(product)

    if(rows.length === 0){
        return c.json({error: 'no hay productos'}, 404)
    }

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

    const [row] = await db.delete(product).where(eq(product.sku, sku)).returning()

    if(!row){
        return c.json({error: 'no encontrado'}, 404)
    }

    return c.body(null, 204)
})


export default productRoute