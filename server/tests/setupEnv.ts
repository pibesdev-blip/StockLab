import { config } from 'dotenv';

// Fuerza la base de pruebas antes de que se importe PrismaClient.
config({ path: '.env.test', override: true });
