import { Hono } from 'hono'
import { Env } from './types'
import movementTypeRoute from './routes/movementType.routes'
import locationRoute from './routes/location.routes'
import productRoute from './routes/product.routes'
import movementRoute from './routes/movement.routes'
import { errorMessage } from './db/errors'



const app = new Hono<Env>()

app.onError((err, c) => {
    console.error(err)

    const message = errorMessage(err)

    if(message.includes('UNIQUE constraint failed')){
        return c.json({error: 'el recurso ya existe'}, 409)
    }

    if(message.includes('FOREIGN KEY constraint failed')){
        return c.json({error: 'referencia inválida o recurso con dependencias'}, 409)
    }

    if(message.includes('CHECK constraint failed')){
        return c.json({error: 'restricción de datos violada'}, 409)
    }

    return c.json({error: 'error interno'}, 500)
})

app.notFound((c) => c.json({error: 'ruta no encontrada'}, 404))

app.route('/api', movementTypeRoute)

app.route('/api', locationRoute)

app.route('/api', productRoute)

app.route('/api', movementRoute)

export default app
