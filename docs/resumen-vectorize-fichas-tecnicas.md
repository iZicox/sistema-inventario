# Resumen: búsqueda vectorial de fichas técnicas (Cloudflare)

> Documento de análisis y plan para el proyecto **sistema-inventario**.
> Fecha: 22 de octubre de 2026.

## TL;DR

- El proyecto es un **sistema de inventario** sobre **Cloudflare Workers + Hono + D1 + Drizzle**.
- Se quiere añadir **búsqueda semántica de fichas técnicas en PDF** (documentos en inglés, consultas en español) y **recomendación de productos**.
- Stack propuesto: **R2** (PDFs) + **Workers AI `bge-m3`** (embeddings multilingües) + **Vectorize** (índice) + **D1** (metadatos y relación con productos).
- Con el **plan gratuito** y fichas de **1,200 palabras**, se pueden indexar aproximadamente **1,220 fichas** (chunks de 400 palabras con 15% de solape) y hacer **~4,880 búsquedas/mes** con `topK=5`.
- El coste de embeber **todo** el catálogo es de **~2,100 neurons (~$0.02)**, es decir, **gratis** dentro de la cuota diaria de 10,000 neurons.

---

## 1. Estado actual

### Proyecto

| Elemento | Estado |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono 4.x |
| Base de datos | D1 + Drizzle ORM |
| Esquema actual | `product`, `location`, `movement`, `movement_type`, `stock` |
| API | Solo `GET /` ("Hello Hono!") — sin endpoints de negocio todavía |
| `wrangler.jsonc` | Binding `DB` apunta a `d1-local-con-drizzle` con `database_id` **vacío** |
| Migraciones | `drizzle/0000_init.sql` generada y seed con `WAREHOUSE` + 6 tipos de movimiento |

### Cuenta de Cloudflare

| Recurso | Estado |
|---|---|
| Cuenta | `Lifud.iberia@gmail.com's Account` |
| D1 | 1 base: `crm-interna` (esquema CRM, **no** corresponde al inventario) |
| Workers KV | 0 namespaces |
| Hyperdrive | 0 configuraciones |
| Vectorize | 0 índices |
| R2 | **No habilitado** (la API devuelve "Please enable R2 through the Cloudflare Dashboard") |

> ⚠️ La D1 de inventario de este repo aún no existe en Cloudflare. Hay que crearla y rellenar `database_id` en `wrangler.jsonc` antes de desplegar.

---

## 2. Objetivo funcional

1. Subir **fichas técnicas en PDF, en inglés**.
2. Extraer el texto, trocearlo y generar embeddings.
3. Permitir **consultas en español** ("bomba con caudal de 50 l/min") que encuentren el fragmento relevante en inglés.
4. Devolver el fragmento, la página y el enlace al PDF original.
5. Opcional: usar los resultados para **recomendar productos** del catálogo.

El enfoque es **cross-lingual**: no se traducen los documentos; se usa un modelo multilingüe que sitúa inglés y español en el mismo espacio vectorial.

---

## 3. Arquitectura propuesta

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  PDF (EN)   │────▶│  Extracción  │────▶│  Chunking     │
│  en R2      │     │  de texto    │     │  400 palabras │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │ Workers AI      │
                                        │ bge-m3 (1024d)  │
                                        └────────┬────────┘
                                                 │ vectores
                                                 ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Consulta ES │────▶│ bge-m3       │────▶│ Vectorize       │
│ del usuario │     │ (embedding)  │     │ topK + metadata │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │ D1: producto,   │
                                        │ ficha, chunk    │
                                        └─────────────────┘
```

### Componentes

| Componente | Uso |
|---|---|
| **R2** | Guardar los PDFs originales (10 GB gratis/mes, sin coste de egress) |
| **Workers AI** | Generar embeddings con `@cf/baai/bge-m3` (1,024 dims, multilingüe) |
| **Vectorize** | Índice `datasheets` (1024 dims, métrica `cosine`) |
| **D1** | Metadatos: producto, ficha, chunk, página, idioma, estado |
| **Workers/Hono** | Endpoints de ingesta, búsqueda y recomendación |

### Modelo de datos a añadir en D1

```ts
// Ficha técnica subida
datasheet (
  id, product_id, r2_key, filename,
  language, pages, status, created_at
)

// Fragmento indexado (1 fila por vector)
datasheet_chunk (
  id, datasheet_id, chunk_index,
  vector_id,        // ID en Vectorize
  content,          // texto del chunk
  page,             // página del PDF
  tokens
)
```

`product` debería ampliarse con `name`, `description`, `category`, `brand` para poder recomendar y filtrar.

### Metadata en Vectorize

Guardar por vector (máx. 10 KB):

```json
{
  "product_id": 42,
  "sku": "PUMP-50",
  "datasheet_id": 7,
  "page": 3,
  "language": "en",
  "category": "pumps"
}
```

Los **metadata indexes** permiten filtrar por `product_id` o `category` antes de la búsqueda vectorial.

---

## 4. Capacidad del plan gratuito

### Límites

| Recurso | Plan Free | Plan Paid ($5/mes) |
|---|---|---|
| Workers AI (embeddings) | **10,000 neurons/día** | 10,000/día + $0.011 por 1,000 extra |
| Vectorize — almacenamiento | **5M dimensiones** | 10M incluidas + $0.05/100M |
| Vectorize — consultas | **30M dims/mes** | 50M incluidas + $0.01/M |
| Vectorize — índices | 100 | 50,000 |
| Vectorize — namespaces/índice | 1,000 | 50,000 |
| R2 | 10 GB-mes, 1M ops A, 10M ops B, egress gratis | Pago por uso |

### Traducción a megabytes

Cada dimensión ocupa 4 bytes (`float32`):

**5,000,000 dims × 4 bytes = 20 MB** de vectores.

Con `bge-m3` (1,024 dims/vector):

**5,000,000 ÷ 1,024 = 4,882 chunks máximos**

---

## 5. Cálculo para fichas de 1,200 palabras

### Capacidad según el tamaño de chunk

| Chunk | Chunks/ficha | Fichas máx. (sin solape) | Fichas máx. (15% solape) |
|---|---|---|---|
| 200 palabras | 6–8 | 813 | 610 |
| 250 palabras | 5–6 | 976 | 813 |
| 300 palabras | 4–5 | 1,220 | 976 |
| **400 palabras** | **3–4** | **1,627** | **1,220** |
| 500 palabras | 3 | 1,627 | 1,627 |
| 600 palabras | 2–3 | 2,441 | 1,627 |
| 1,200 palabras (ficha completa) | 1 | 4,882 | 4,882 |

### Recomendación

**Chunks de 400 palabras con 15% de solape → ~1,220 fichas.**

- 4 chunks por ficha (1,200 ÷ 340 de paso efectivo ≈ 3.5 → 4).
- 4,882 chunks ÷ 4 = **1,220 fichas**.
- Equilibrio entre precisión de búsqueda y capacidad.

> El máximo teórico de 4,882 fichas (1 vector por ficha) **no es recomendable**: un vector de 1,200 palabras diluye el significado y la búsqueda pierde precisión.

### Consumo para indexar 1,220 fichas

| Métrica | Valor |
|---|---|
| Palabras totales | **1,464,000** |
| Tokens (~0.75 palabras/token) | **~1,950,000** |
| Neurons (`bge-m3`, 1,075/M tokens) | **~2,100** |
| % de la cuota diaria (10,000) | **21%** |
| Coste si se pagara | **~$0.02** |
| Espacio vectorial | **20 MB** |
| Por ficha | **16 KB** (4 chunks × 4 KB) |
| PDFs originales (300–800 KB c/u) | **~0.4–1 GB** (van en R2) |

✅ Todo el catálogo se indexa en **un solo día gratis**, sobrando ~7,900 neurons.

---

## 6. Equivalencia de 10,000 neurons

Con `bge-m3` (1,075 neurons por millón de tokens de entrada):

| Equivalencia | Valor |
|---|---|
| Tokens de entrada | **9,300,000 / día** |
| Palabras en inglés | **~7,000,000 / día** |
| Páginas PDF (~500 palabras/pág) | **~14,000 / día** |
| Texto extraído (~3 KB/pág) | **~42 MB / día** |
| Valor monetario | **$0.011** |

El límite de neurons **no es el cuello de botella**: se pueden procesar ~14,000 páginas/día, muy por encima de las ~3,000–5,000 páginas que caben almacenadas.

---

## 7. Capacidad de consultas

Con 1,024 dims, el plan Free incluye 30M dims consultadas/mes. Estimación según la fórmula oficial (dimensiones almacenadas + `topK` × dimensiones por consulta):

| `topK` | Consultas/mes aprox. | Consultas/día |
|---|---|---|
| 3 | ~8,100 | ~270 |
| **5** | **~4,880** | **~160** |
| 8 | ~3,050 | ~100 |
| 10 | ~2,440 | ~80 |

> Cada consulta en español también consume un embedding (unas decenas de tokens): 5,000 consultas ≈ 150k tokens ≈ 161 neurons/mes, insignificante.

---

## 8. Costes y escalado

| Escenario | Fichas (400 palabras) | Plan | Coste |
|---|---|---|---|
| MVP / catálogo pequeño | hasta ~1,220 | Free | **$0** |
| Catálogo medio | hasta ~2,440 | Workers Paid | **$5/mes** |
| Catálogo grande | hasta ~4,880 | Paid + 20M dims | ~$5.25/mes |
| 10,000 fichas | ~40,000 chunks | Paid + 41M dims extra | ~$25/mes aprox. |

El salto a **Workers Paid ($5/mes)** duplica almacenamiento (10M dims) y consultas (50M/mes), y suele ser la opción natural si el catálogo supera las ~1,200 fichas.

---

## 9. Decisiones y riesgos

### Decisiones recomendadas

1. **Modelo:** `@cf/baai/bge-m3` — multilingüe, 1,024 dims, 60k de contexto, $0.0118/M tokens. Alternativa equivalente: `@cf/qwen/qwen3-embedding-0.6b` (mismas dims y precio).
2. **No usar** `bge-small/base/large-en-v1.5`: son solo inglés.
3. **Chunking:** 400 palabras, 15% de solape, cortando por secciones/tablas, no por página ciega.
4. **Metadata:** `product_id`, `sku`, `page`, `category`, `language` para filtrar y enlazar al PDF.
5. **Búsqueda híbrida:** combinar Vectorize con búsqueda exacta en D1 (FTS5) por SKU/modelo; los modelos y referencias exactas fallan en búsqueda puramente semántica.
6. **Re-ranking opcional:** `@cf/baai/bge-reranker-base` ($0.003/M tokens) sobre el topK para mejorar precisión.

### Riesgos / pendientes

| Riesgo | Mitigación |
|---|---|
| **R2 no está habilitado** en la cuenta | Activarlo en el dashboard antes de implementar la ingesta |
| La D1 de inventario no existe aún | Crearla y poner el `database_id` en `wrangler.jsonc` |
| Tablas y especificaciones en los PDFs | Usar extracción layout-aware; validar manualmente una muestra |
| Cambiar de modelo obliga a re-indexar | Fijar `bge-m3` desde el inicio (1,024 dims) |
| PDFs escaneados (sin texto) | Detectar y aplicar OCR antes de indexar |
| Duplicados al re-subir fichas | Versionar por `datasheet_id` y borrar vectores antiguos |
| Coste de consultas si crece el tráfico | Monitorizar en el dashboard; `topK` bajo (5–8) |

### Alternativa gestionada

**Cloudflare AutoRAG** puede automatizar ingesta desde R2, chunking, embeddings y búsqueda. Conviene evaluarla antes de construir el pipeline a mano; su consumo se factura sobre los mismos servicios (R2 + Workers AI + Vectorize). Verificar disponibilidad y límites actuales antes de decidir.

---

## 10. Plan de implementación

- [ ] Activar **R2** y crear el bucket `datasheets`.
- [ ] Crear la **D1 de inventario** y actualizar `database_id`.
- [ ] Añadir a Drizzle las tablas `datasheet` y `datasheet_chunk`; ampliar `product`.
- [ ] Añadir bindings en `wrangler.jsonc`: `AI`, `VECTORIZE`, `BUCKET`.
- [ ] Crear el índice Vectorize `datasheets` (1024 dims, cosine, metadata indexes).
- [ ] Implementar extracción de texto + chunking (400 palabras, 15% solape).
- [ ] Implementar ingesta: PDF → R2 → chunks → embeddings → Vectorize + D1.
- [ ] Implementar `POST /search` (consulta ES → embedding → Vectorize → resultados + página).
- [ ] Implementar recomendación de productos a partir de los chunks recuperados.
- [ ] Añadir búsqueda híbrida (SKU/modelo) y re-ranking.
- [ ] Medir consumo real en el dashboard y decidir Free vs Paid.

---

## 11. Fuentes

- [Vectorize — Pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)
- [Vectorize — Limits](https://developers.cloudflare.com/vectorize/platform/limits/)
- [Workers AI — Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Modelo bge-m3](https://developers.cloudflare.com/workers-ai/models/bge-m3/)
- [R2 — Pricing](https://developers.cloudflare.com/r2/pricing/)

> Los precios y límites son los publicados por Cloudflare en octubre de 2026 y pueden cambiar. Las estimaciones de consultas siguen la fórmula oficial de facturación por dimensiones.
