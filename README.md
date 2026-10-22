# Sistema de Inventario

API de inventario construida sobre **Cloudflare Workers**, **Hono**, **D1** y **Drizzle ORM**.

El proyecto separa dos conceptos:

- **Movimientos**: historial inmutable de todo lo que entra, sale o se ajusta.
- **Stock**: cantidad actual de cada producto en cada ubicación, calculada a partir de los movimientos.

---

## Stack

| Tecnología | Uso |
|---|---|
| Cloudflare Workers | Runtime de la API |
| Hono | Framework HTTP y enrutado |
| D1 | Base de datos SQLite gestionada por Cloudflare |
| Drizzle ORM | Esquema, consultas y migraciones |
| Zod | Validación de datos de entrada |

---

## Puesta en marcha

```bash
npm install
npm run dev
```

La API queda disponible en `http://localhost:8787/api`.

### Base de datos local

| Comando | Qué hace |
|---|---|
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:apply:local` | Aplica las migraciones pendientes en D1 local |
| `npm run db:seed:local` | Carga los catálogos iniciales de `seed.sql` |
| `npm run db:reset:local` | Borra el estado local, aplica migraciones y ejecuta el seed |
| `npm run db:list:local` | Lista las migraciones aplicadas en local |
| `npm run db:apply:remote` | Aplica las migraciones en D1 remoto |

El seed crea la ubicación `WAREHOUSE` y los tipos de movimiento del MVP:

- `ENTRY`
- `EXIT`
- `TRANSFER_OUT`
- `TRANSFER_IN`
- `ADJUSTMENT_UP`
- `ADJUSTMENT_DOWN`

> `npm run db:reset:local` es destructivo y solo afecta al entorno local.

### Despliegue

```bash
npm run deploy
```

Antes de desplegar hay que crear la base de datos D1 en Cloudflare y rellenar `database_id` en `wrangler.jsonc`. Actualmente el binding `DB` apunta a la base `d1-local-con-drizzle` con `database_id` vacío.

### Tipos de Cloudflare

```bash
npm run cf-typegen
```

Los tipos de los bindings se declaran en `src/types.ts`.

---

## Modelo de datos

| Tabla | Propósito |
|---|---|
| `movement_type` | Catálogo de tipos de movimiento. Cada tipo tiene un `sign` que indica si suma (`1`) o resta (`-1`). |
| `location` | Ubicaciones físicas. En el MVP solo existe `WAREHOUSE`. |
| `product` | Catálogo de productos, identificados por un SKU único. |
| `movement` | Historial inmutable de movimientos. Cada fila guarda producto, ubicación, tipo, cantidad positiva, nota y fecha. |
| `stock` | Proyección del stock por combinación producto–ubicación. Su clave primaria es `(product_id, location_id)`. |

### Movimientos frente a stock

`movement` es la fuente de verdad. Cada movimiento guarda una cantidad **siempre positiva**; la dirección la determina el tipo de movimiento, no la cantidad.

```txt
stock(producto, ubicación) = Σ (movement.quantity × movement_type.sign)
```

Ejemplo:

| Movimiento | Tipo | Signo | Cantidad | Efecto | Stock resultante |
|---|---|---:|---:|---:|---:|
| 1 | `ENTRY` | 1 | 10 | +10 | 10 |
| 2 | `EXIT` | -1 | 3 | -3 | 7 |
| 3 | `EXIT` | -1 | 2 | -2 | 5 |
| 4 | `EXIT` | -1 | 6 | -6 | **Error: el stock no puede quedar negativo** |

Reglas derivadas:

- La cantidad de un movimiento nunca es negativa.
- El signo lo decide el servidor según el tipo de movimiento; el cliente no lo envía.
- El stock nunca se modifica directamente desde una ruta normal: se actualiza como consecuencia de un movimiento.
- El movimiento y la actualización del stock deben ocurrir en una sola operación atómica.
- La base de datos debe impedir que el stock quede negativo.

---

## API

Todas las rutas se montan bajo el prefijo `/api`.

### Resumen

| Método | Ruta | Estado | Descripción |
|---|---|---|---|
| `GET` | `/movement-type` | Implementada | Lista los tipos de movimiento |
| `GET` | `/movement-type/:code` | Implementada | Obtiene un tipo por código |
| `GET` | `/locations` | Implementada | Lista las ubicaciones |
| `GET` | `/locations/:id` | Implementada | Obtiene una ubicación por id |
| `POST` | `/products` | Implementada | Crea un producto |
| `GET` | `/products` | Implementada | Lista los productos |
| `GET` | `/products/:sku` | Implementada | Obtiene un producto por SKU |
| `DELETE` | `/products/:sku` | Implementada | Elimina un producto |
| `POST` | `/movements` | Implementada | Crea un movimiento y actualiza el stock |
| `GET` | `/movements` | Implementada | Lista el historial de movimientos |
| `GET` | `/movements/:id` | Implementada | Obtiene un movimiento por id |
| `GET` | `/movements/location/:id` | Implementada | Lista los movimientos de una ubicación |
| `GET` | `/movements/product/:id` | Pendiente | Lista los movimientos de un producto |
| `GET` | `/stock` | Pendiente | Consulta el stock actual |
| `GET` | `/stock/product/:id` | Pendiente | Consulta el stock de un producto |
| `GET` | `/stock/location/:id` | Pendiente | Consulta el stock de una ubicación |
| `GET` | `/stock/:productId/:locationId` | Pendiente | Consulta el stock de un producto en una ubicación |
| `POST` | `/stock/recalculate` | Pendiente | Reconstruye el stock desde el historial |
| `POST` | `/movements/transfer` | Pendiente | Registra una transferencia entre ubicaciones |

> Las rutas marcadas como «Pendiente» todavía no están implementadas. Consulta la sección [Estado actual y pendientes](#estado-actual-y-pendientes).

---

## Rutas de catálogos

### `GET /movement-type`

Devuelve todos los tipos de movimiento con su código, descripción y signo.

- Sirve para que el frontend sepa qué opciones existen y cuál suma o resta.
- Es solo lectura.
- El signo es responsabilidad del servidor; el cliente no lo envía al crear un movimiento.

### `GET /movement-type/:code`

Devuelve un tipo concreto.

- Normaliza el código antes de buscarlo.
- Si no existe, responde «no encontrado».
- Sirve para validar un tipo antes de usarlo.

### `GET /locations`

Lista las ubicaciones.

- En el MVP probablemente solo exista `WAREHOUSE`.
- Solo lectura.

### `GET /locations/:id`

Devuelve una ubicación concreta.

- El id debe ser un entero positivo.
- Si no existe, «no encontrado».

### `POST /products`

Crea un producto.

- Recibe el SKU.
- Valida formato, lo normaliza y comprueba que no esté duplicado.
- Si el SKU ya existe responde `409`, no un error genérico.
- Devuelve el producto creado.

### `GET /products`

Lista productos.

- Solo catálogo; no calcula stock.
- Conviene paginar y ordenar.
- Si no hay productos devuelve una lista vacía (`200 []`).

### `GET /products/:sku`

Devuelve un producto por SKU.

- Normaliza el SKU.
- Si no existe, «no encontrado».

### `DELETE /products/:sku`

Borra un producto.

- Solo debería permitirse si el producto no tiene movimientos ni stock.
- Si tiene historial, hay dos opciones conceptuales:
  - rechazar la operación con un conflicto, o
  - hacer un borrado lógico para no perder trazabilidad.
- En un inventario serio, el borrado lógico suele ser la mejor opción.
- Hoy responde `409` si el producto tiene movimientos o stock asociado.

---

## Rutas de movimientos

### `POST /movements`

Es la ruta más importante: **la única que modifica el stock**.

Conceptualmente debe hacer esto:

1. Validar que el producto, la ubicación y el tipo de movimiento existan.
2. Leer el signo del tipo de movimiento.
3. Calcular el efecto sobre el stock: cantidad × signo.
4. Registrar el movimiento en el historial.
5. Actualizar el stock en la misma operación atómica.
6. Rechazar la operación si el stock quedaría negativo.

Reglas:

- La cantidad siempre es positiva.
- El signo lo pone el servidor según el tipo.
- El movimiento y la actualización del stock deben ser **todo o nada**.
- Si falta stock, no debe quedar registrado el movimiento.
- Si el producto o la ubicación no existen, debe ser un error de datos, no un error interno.
- Devuelve el movimiento creado y, opcionalmente, el stock resultante.

Consideración: si el cliente reintenta la petición por un timeout, podría crear el movimiento dos veces. A futuro conviene un identificador de idempotencia, pero para el MVP basta con tenerlo presente.

### `GET /movements`

Lista el historial de movimientos.

- No calcula stock; solo muestra lo que pasó.
- Debería permitir filtrar por producto, ubicación, tipo y rango de fechas.
- Hoy ordena de más reciente a más antiguo. Pendiente: filtros y paginación.
- Como el historial es inmutable, es solo lectura.

### `GET /movements/:id`

Devuelve un movimiento concreto.

- El id debe ser válido.
- Si no existe, «no encontrado».
- Debe devolver un objeto, no una lista de un elemento.

### `GET /movements/location/:id`

Lista los movimientos de una ubicación.

- Valida que la ubicación exista.
- Devuelve el historial de esa ubicación, ordenado de reciente a antiguo.
- **No devuelve el stock de la ubicación**; solo los movimientos. Es una confusión fácil de tener.
- Si no hay movimientos, lo normal es devolver una lista vacía, no «no encontrado».

### `GET /movements/product/:id`

Lista el historial de un producto.

- Útil para auditoría y para responder «¿por qué este producto tiene este stock?».
- Misma lógica que la ruta por ubicación.

---

## Rutas de stock

### `GET /stock`

Devuelve el stock actual de cada combinación producto–ubicación.

- Lee la tabla de stock, no recalcula todo el historial.
- Debería incluir datos legibles: SKU del producto, código de la ubicación, cantidad y fecha de actualización.
- Puede aceptar filtros por producto o por ubicación.
- Solo lectura.

Semántica a decidir: ¿se muestran solo productos con movimientos, o también productos con stock cero? Para un panel de inventario suele ser mejor mostrar también los ceros, aunque eso requiere otro enfoque de consulta.

### `GET /stock/product/:id`

Devuelve el stock de un producto en todas sus ubicaciones.

- Útil para ver «cuánto hay de este producto y dónde».
- Puede incluir el total sumando ubicaciones.
- Si el producto no existe, «no encontrado».
- Si existe pero no tiene movimientos, la respuesta natural es una lista vacía o cantidad cero, no un error.

### `GET /stock/location/:id`

Devuelve todo el stock de una ubicación.

- Responde «qué hay físicamente en este almacén».
- Es distinto de `GET /movements/location/:id`, que responde «qué se movió en este almacén».

### `GET /stock/:productId/:locationId`

Devuelve el stock de un producto en una ubicación concreta.

- Si no hay fila de stock, hay que decidir si se devuelve cero o «no encontrado».
- Conceptualmente, «no hay stock registrado» no equivale a «no existe la combinación».
- Para un cliente suele ser más cómodo recibir cero.

### `POST /stock/recalculate`

Reconstruye el stock a partir de todo el historial de movimientos.

- No es una ruta de uso normal.
- Sirve para reparar desincronizaciones, tras importaciones manuales o cambios de lógica.
- Debería comparar el stock calculado con el guardado y corregir diferencias.
- Debería estar protegida; no es algo que un usuario normal ejecute.

---

## Transferencias entre ubicaciones

Una transferencia no es un tipo de movimiento único: conceptualmente son **dos movimientos**:

- una salida en la ubicación de origen;
- una entrada en la ubicación de destino;
- la misma cantidad en ambos.

Ambos movimientos y ambas actualizaciones de stock deben ocurrir en una sola operación atómica. Si se hicieran con dos peticiones separadas y fallara la segunda, el stock quedaría descuadrado.

Por eso, si van a existir transferencias reales, conviene una ruta propia del estilo `POST /movements/transfer` que registre las dos partes juntas. Para el MVP puede bastar con no exponer transferencias todavía.

---

## Reglas de negocio

- La cantidad de un movimiento siempre es positiva; el signo lo determina el tipo de movimiento.
- El historial es append-only: no se edita ni se borra un movimiento.
- El stock nunca se escribe a mano desde una ruta normal; solo se deriva de los movimientos.
- El movimiento y la actualización de stock van juntos: si una parte falla, la otra no debe quedar aplicada.
- El stock no puede ser negativo; la base de datos debe impedirlo, no solo el código.
- Hay que validar en la frontera: ids, cantidades, tipos y existencia de referencias.
- Los errores deben tener significado: datos inválidos, no encontrado, conflicto por stock insuficiente, error interno.
- Los listados deben estar ordenados y, sobre todo el historial, paginados.
- Las rutas estáticas deben declararse antes que las rutas con parámetros para evitar ambigüedades.
- Las escrituras (crear movimientos, crear productos, recalcular stock) deberían estar protegidas.

En resumen: `movements` cuenta **qué pasó**; `stock` responde **cuánto hay ahora**. Las rutas de movimientos no deberían calcular stock, y las de stock no deberían inventar movimientos.

---

## Códigos de estado

| Código | Uso |
|---|---|
| `200` | Consulta correcta |
| `201` | Recurso creado correctamente |
| `204` | Operación correcta sin contenido de respuesta |
| `400` | Datos inválidos o referencias inexistentes |
| `404` | Recurso no encontrado |
| `409` | Conflicto: SKU duplicado, stock insuficiente o producto con historial |
| `500` | Error inesperado del servidor |

---

## Estructura del proyecto

```txt
src/
├── db/
│   ├── client.ts          # Conexión con Drizzle y D1
│   └── schema.ts          # Esquema de las tablas
├── routes/
│   ├── location.routes.ts
│   ├── movement.routes.ts
│   ├── movementType.routes.ts
│   └── product.routes.ts
├── index.ts               # Registro de rutas
├── types.ts               # Tipos de los bindings
└── validators.ts          # Esquemas de validación con Zod
drizzle/                   # Migraciones generadas
seed.sql                   # Catálogos iniciales
test.http                  # Ejemplos de peticiones
```

---

## Estado actual y pendientes

Implementado:

- `POST /movements` registra el movimiento y actualiza el stock en un único batch atómico de D1. Si el stock quedaría negativo, el `CHECK` de la tabla aborta el batch completo y se responde `409`.
- `stock.quantity` tiene `CHECK (quantity >= 0)` y `movement.quantity` tiene `CHECK (quantity > 0)`.
- `GET /movements/:id` devuelve un objeto y responde `404` si no existe.
- `GET /movements/location/:id` valida la ubicación y devuelve el historial ordenado.
- `GET /movements` ordena de más reciente a más antiguo.
- `POST /products` responde `409` si el SKU ya existe.
- `DELETE /products/:sku` responde `409` si el producto tiene movimientos o stock asociado.
- Los errores de D1 (`UNIQUE`, `FOREIGN KEY`, `CHECK`) se traducen a respuestas JSON con `409` mediante `app.onError`.
- `npm run db:seed:local` es idempotente.

Pendiente:

- Rutas de stock (`GET /stock`, por producto, por ubicación, por combinación).
- `GET /movements/product/:id`.
- Filtros y paginación en los listados.
- `POST /movements/transfer` y `POST /stock/recalculate`.
- Idempotencia en `POST /movements` para reintentos del cliente.
- Proteger las escrituras con autenticación.
- Crear la base de datos D1 remota y configurar `database_id`.
- Unificar `movement.movementTypeCode` a snake_case (`movement_type_code`) en una migración futura.
