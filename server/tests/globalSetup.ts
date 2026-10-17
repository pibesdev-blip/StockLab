import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

// Aplica las migraciones sobre la base de pruebas (la crea si no existe).
export default function setup() {
  const env = { ...process.env, ...parse(readFileSync('.env.test')) };
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
}
