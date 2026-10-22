import { Hono } from 'hono'
import { Env } from './types'
import movementTypeRoute from './routes/movementType.routes'
import locationRoute from './routes/location.routes'
import productRoute from './routes/product.routes'
import movementRoute from './routes/movement.routes'



const app = new Hono<Env>()

app.route('/api', movementTypeRoute)

app.route('/api', locationRoute)

app.route('/api', productRoute)

app.route('/api', movementRoute)

export default app
