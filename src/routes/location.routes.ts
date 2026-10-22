import { Hono } from "hono";
import { Env } from "../types";
import { getDb } from "../db/client";
import { location } from "../db/schema";
import { idIntSchema } from "../validators";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";


const locationRoute = new Hono<Env>()

// listar todos
locationRoute.get('/locations', async (c) => {
    const db = getDb(c.env.DB)

    const rows = await db.select().from(location)

    return c.json(rows)
})

// list id
locationRoute.get('/locations/:id', zValidator('param', idIntSchema), async (c) => {
    const { id } = c.req.valid('param')
    const db = getDb(c.env.DB)

    const [row] = await db.select().from(location).where(eq(location.id, id))

    if(!row){
        return c.json({error: 'no encontrado'}, 404)
    }

    return c.json(row)
})

export default locationRoute