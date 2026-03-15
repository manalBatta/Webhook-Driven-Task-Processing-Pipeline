import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// Single shared Postgres connection pool for the whole app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Drizzle ORM instance you will import elsewhere
export const db = drizzle(pool);

