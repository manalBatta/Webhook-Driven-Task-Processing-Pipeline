"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const node_postgres_1 = require("drizzle-orm/node-postgres");
// Single shared Postgres connection pool for the whole app
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
// Drizzle ORM instance you will import elsewhere
exports.db = (0, node_postgres_1.drizzle)(pool);
