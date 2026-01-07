const { Pool } = require("pg");

const getConnectionString = () =>
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

const connectionString = getConnectionString();

if (!connectionString) {
  throw new Error("Missing database connection string.");
}

const pool = global.__dashboardPool || new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

if (!global.__dashboardPool) {
  global.__dashboardPool = pool;
}

const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
