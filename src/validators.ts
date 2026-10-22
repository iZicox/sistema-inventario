import z from "zod";

export const movementTypeCodeSchema = z.object({
    code: z.string().trim().min(1, "código es obligatorio").toUpperCase()
})

export const idIntSchema = z.object({
    id: z.coerce.number().int().positive()
})

export const productLocationSchema = z.object({
    productId: z.coerce.number().int().positive(),
    locationId: z.coerce.number().int().positive()
})

export const stockQuerySchema = z.object({
    productId: z.coerce.number().int().positive().optional(),
    locationId: z.coerce.number().int().positive().optional()
})

export const skuSchema = z.object({    
    sku: z
    .string("sku debe ser un texto")
    .trim()
    .min(1, "sku es obligatorio")
    .max(64, "sku admite como máximo 64 caracteres")
    .regex(/^[A-Za-z0-9._-]+$/, "sku solo admite letras, números, '.', '_' y '-'")
    .transform((v) => v.toUpperCase())
}) 

export const createMovementSchema = z.object({
    productId: z.coerce.number().int().positive(),
    locationId: z.coerce.number().int().positive(),
    movementTypeCode: z.string().trim().min(1, "tipo de movimiento es obligatorio").toUpperCase(),
    quantity: z.coerce.number().int().positive(),
    note: z.string().max(500, "note admite como máximo 500 caracteres").optional()
})



