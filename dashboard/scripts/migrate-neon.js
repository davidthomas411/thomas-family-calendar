const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const loadEnvFile = () => {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) {
      return;
    }
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

const getConnectionString = () =>
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

const loadBlobJson = async (key, fallback) => {
  const { head } = await import("@vercel/blob");
  try {
    const blob = await head(key);
    const url = new URL(blob.url);
    url.searchParams.set("v", Date.now().toString());
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    return response.json();
  } catch (error) {
    const message = error && error.message ? error.message : "";
    if (
      (error && error.name === "BlobNotFoundError") ||
      (error && error.status === 404) ||
      message.includes("requested blob does not exist")
    ) {
      return fallback;
    }
    throw error;
  }
};

const normalizeTime = (value) => {
  if (!value) {
    return null;
  }
  return String(value).slice(0, 5);
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }
  return String(value).slice(0, 10);
};

const normalizeTimestamp = (value) => {
  if (!value) {
    return new Date().toISOString();
  }
  return new Date(value).toISOString();
};

const ensureSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      calendar TEXT NOT NULL,
      details TEXT NOT NULL,
      date DATE NOT NULL,
      time TIME,
      end_date DATE,
      end_time TIME,
      all_day BOOLEAN DEFAULT FALSE,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY,
      text TEXT NOT NULL,
      due_date DATE,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      completed_by TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_settings (
      id TEXT PRIMARY KEY,
      filters JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
};

const migrateEvents = async (pool, events) => {
  let count = 0;
  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }
    const createdAt = normalizeTimestamp(event.createdAt);
    const updatedAt = normalizeTimestamp(event.updatedAt || event.createdAt);
    const endDate = normalizeDate(event.endDate);
    const endTime = normalizeTime(event.endTime);
    await pool.query(
      `INSERT INTO events (
        id, calendar, details, date, time, end_date, end_time, all_day,
        created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      ON CONFLICT (id) DO UPDATE SET
        calendar = EXCLUDED.calendar,
        details = EXCLUDED.details,
        date = EXCLUDED.date,
        time = EXCLUDED.time,
        end_date = EXCLUDED.end_date,
        end_time = EXCLUDED.end_time,
        all_day = EXCLUDED.all_day,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        event.id,
        event.calendar,
        event.details,
        normalizeDate(event.date),
        normalizeTime(event.time),
        endDate,
        endTime,
        Boolean(event.allDay),
        event.createdBy || null,
        createdAt,
        updatedAt,
      ]
    );
    count += 1;
  }
  return count;
};

const migrateTodos = async (pool, todos) => {
  let count = 0;
  for (const todo of todos) {
    if (!todo || !todo.id) {
      continue;
    }
    await pool.query(
      `INSERT INTO todos (
        id, text, due_date, created_by, created_at, updated_at, completed_at, completed_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        due_date = EXCLUDED.due_date,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        completed_at = EXCLUDED.completed_at,
        completed_by = EXCLUDED.completed_by`,
      [
        todo.id,
        todo.text,
        normalizeDate(todo.dueDate),
        todo.createdBy || null,
        normalizeTimestamp(todo.createdAt),
        normalizeTimestamp(todo.updatedAt || todo.createdAt),
        todo.completedAt ? normalizeTimestamp(todo.completedAt) : null,
        todo.completedBy || null,
      ]
    );
    count += 1;
  }
  return count;
};

const migrateSettings = async (pool, settings) => {
  if (!settings || !settings.filters) {
    return false;
  }
  await pool.query(
    `INSERT INTO calendar_settings (id, filters, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       filters = EXCLUDED.filters,
       updated_at = EXCLUDED.updated_at`,
    ["default", settings.filters, normalizeTimestamp(settings.updatedAt)]
  );
  return true;
};

const run = async () => {
  loadEnvFile();
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL/POSTGRES_URL.");
  }
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await ensureSchema(pool);

    const eventsPayload = await loadBlobJson("events.json", { events: [] });
    const todosPayload = await loadBlobJson("todos.json", { todos: [] });
    const settingsPayload = await loadBlobJson("calendar-settings.json", { settings: null });

    const eventsCount = await migrateEvents(pool, eventsPayload.events || []);
    const todosCount = await migrateTodos(pool, todosPayload.todos || []);
    const settingsOk = await migrateSettings(pool, settingsPayload.settings || null);

    console.log(`Migrated events: ${eventsCount}`);
    console.log(`Migrated todos: ${todosCount}`);
    console.log(`Migrated settings: ${settingsOk ? "yes" : "no"}`);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
