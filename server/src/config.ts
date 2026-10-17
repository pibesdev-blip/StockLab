import 'dotenv/config';

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL (ver .env.example).');
}

export const config = {
  port: toInt(process.env.PORT, 4000),
  defaultMinStock: toInt(process.env.DEFAULT_MIN_STOCK, 5),
};
