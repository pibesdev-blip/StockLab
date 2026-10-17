# StockLab

Sistema pequeño de inventario: productos con categoría, precio, cantidad y stock mínimo. Permite listar, crear, editar y eliminar (con confirmación) productos, gestionar categorías, buscar y filtrar, y ver el total de productos, unidades, productos con stock bajo y valor del inventario.

| Parte | Tecnología | Carpeta |
|---|---|---|
| Frontend | React + Vite + TypeScript | `client/` |
| Backend | Node.js + Express + TypeScript | `server/` |
| Base de datos | PostgreSQL + Prisma (migraciones y seed) | `server/prisma/` |

## Requisitos

- Node.js 20 o superior y npm.
- PostgreSQL 14 o superior. Para desarrollo se puede usar un contenedor:

```bash
docker run -d --name stocklab-postgres \
  -e POSTGRES_USER=stocklab -e POSTGRES_PASSWORD=stocklab -e POSTGRES_DB=stocklab \
  -p 5433:5432 -v stocklab-pgdata:/var/lib/postgresql/data postgres:17
```

(Se usa el puerto 5433 para no chocar con otro Postgres local. Para volver a levantarlo: `docker start stocklab-postgres`.)

## Puesta en marcha local

```bash
npm run install:all                    # dependencias de raíz, server y client
cp server/.env.example server/.env     # ajustar DATABASE_URL si hace falta
npm run db:deploy                      # aplica las migraciones
npm run db:seed                        # carga datos de ejemplo (borra los existentes)
npm run dev                            # API en :4000 y web en http://localhost:5174
```

## Variables de entorno

`server/.env` (ver `server/.env.example`):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto de la API | `4000` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://stocklab:stocklab@localhost:5433/stocklab?schema=public` |
| `DEFAULT_MIN_STOCK` | Stock mínimo por defecto para productos nuevos | `5` |

`client/.env` (opcional, ver `client/.env.example`): `VITE_API_PROXY_TARGET`, URL a la que Vite redirige `/api` (por defecto `http://localhost:4000`).

## Scripts (raíz)

| Script | Descripción |
|---|---|
| `npm run dev` | API (tsx watch) y frontend (Vite) en paralelo. |
| `npm run build` | Compila la API a `server/dist` y el frontend a `client/dist`. |
| `npm start` | Ejecuta la API compilada y sirve el build del frontend (http://localhost:4174). |
| `npm test` | Pruebas de API (contra la base `stocklab_test`) y del frontend. |
| `npm run db:migrate` | Crea una nueva migración a partir de cambios en `schema.prisma` (desarrollo). |
| `npm run db:deploy` | Aplica las migraciones existentes (otro entorno). |
| `npm run db:seed` | Carga 4 categorías y 15 productos de ejemplo. |

Las pruebas del servidor usan la base indicada en `server/.env.test` (`stocklab_test`), que se crea y migra automáticamente y se vacía en cada prueba.

## API

Todas las rutas bajo `/api`. Los errores responden `{ "error": { "message", "details?" } }`.

| Método | Ruta | Respuestas |
|---|---|---|
| GET | `/health` | 200 |
| GET | `/categories` | 200 (incluye `productCount`) |
| POST | `/categories` | 201 · 400 · 409 nombre duplicado |
| DELETE | `/categories/:id` | 204 · 404 · 409 si tiene productos |
| GET | `/products?search=&categoryId=&lowStock=true` | 200 |
| GET | `/products/stats` | 200 `{ totalProducts, totalUnits, lowStockCount, inventoryValue }` |
| GET | `/products/:id` | 200 · 404 |
| POST | `/products` | 201 · 400 · 409 SKU duplicado |
| PUT | `/products/:id` | 200 · 400 · 404 · 409 |
| DELETE | `/products/:id` | 204 · 404 |

Un producto tiene **stock bajo** cuando `quantity <= minStock`.

## Estructura

```
server/
├── prisma/        schema.prisma, migrations/, seed.ts
├── src/
│   ├── routes/      endpoints HTTP
│   ├── services/    lógica de negocio y acceso a datos
│   ├── validators/  esquemas Zod
│   ├── middleware/  manejo centralizado de errores
│   └── lib/         Prisma client y errores HTTP
└── tests/         pruebas de integración (Vitest + Supertest)
client/
└── src/
    ├── api/         cliente HTTP
    ├── components/  tabla, formulario, filtros, estadísticas, diálogos
    ├── utils/       validación y formato
    └── __tests__/   pruebas de componentes
```
