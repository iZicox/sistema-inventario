import { Hono } from "hono";
import { Env } from "../types";
import { getDb } from "../db/client";
import { movementType } from "../db/schema";
import { zValidator } from "@hono/zod-validator";
import { movementTypeCodeSchema } from "../validators";
import { eq } from "drizzle-orm";


const movementTypeRoute = new Hono<Env>()

// listar
movementTypeRoute.get('/movement-type', async (c) => {
    const db = getDb(c.env.DB)

    const rows = await db
        .select()
        .from(movementType)

    return c.json(rows)
})

// listar por id
movementTypeRoute.get('/movement-type/:code',zValidator('param', movementTypeCodeSchema), async (c) => {
  const { code } = c.req.valid('param')
  const db = getDb(c.env.DB)

  const [row] = await db.select().from(movementType).where(eq(movementType.code, code))

  if(!row){
    return c.json({error: 'no encontrado'}, 404)
  }

  return c.json(row)
})


export default movementTypeRoute