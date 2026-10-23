import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type StoredSourceStatus =
  | "Watching"
  | "Needs review"
  | "Pending connection";

export type StoredSource = {
  id: string;
  name: string;
  category: string;
  url: string;
  deadline: string;
  status: StoredSourceStatus;
  initials: string;
  facts: Record<string, unknown>;
  fetchedAt: string;
  createdAt: string;
};

export type NewStoredSource = Omit<StoredSource, "createdAt">;

type SourceRow = {
  id: string;
  name: string;
  category: string;
  url: string;
  deadline: string;
  status: StoredSourceStatus;
  initials: string;
  facts_json: string;
  fetched_at: string;
  created_at: string;
};

const globalForFactTrail = globalThis as typeof globalThis & {
  __facttrailDatabase?: DatabaseSync;
};

function getDatabase(): DatabaseSync {
  if (globalForFactTrail.__facttrailDatabase) {
    return globalForFactTrail.__facttrailDatabase;
  }

  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });

  const database = new DatabaseSync(
    join(dataDirectory, "facttrail.sqlite"),
  );

  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      url TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('Watching', 'Needs review', 'Pending connection')
      ),
      initials TEXT NOT NULL,
      facts_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS source_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_text TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      changed INTEGER NOT NULL CHECK (changed IN (0, 1)),
      previous_hash TEXT,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_source_snapshots_source_id
      ON source_snapshots(source_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_sources_created_at
      ON sources(created_at DESC);
  `);

  globalForFactTrail.__facttrailDatabase = database;
  return database;
}

function rowToSource(row: SourceRow): StoredSource {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    url: row.url,
    deadline: row.deadline,
    status: row.status,
    initials: row.initials,
    facts: JSON.parse(row.facts_json) as Record<string, unknown>,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
  };
}

export function listSources(): StoredSource[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, name, category, url, deadline, status, initials,
              facts_json, fetched_at, created_at
       FROM sources
       ORDER BY created_at DESC, id DESC`,
    )
    .all() as unknown as SourceRow[];

  return rows.map(rowToSource);
}

export function saveSource(source: NewStoredSource): StoredSource {
  const database = getDatabase();

  database.prepare(`
    INSERT INTO sources (
      id, name, category, url, deadline, status, initials,
      facts_json, fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      url = excluded.url,
      deadline = excluded.deadline,
      status = excluded.status,
      initials = excluded.initials,
      facts_json = excluded.facts_json,
      fetched_at = excluded.fetched_at
  `).run(
    source.id,
    source.name,
    source.category,
    source.url,
    source.deadline,
    source.status,
    source.initials,
    JSON.stringify(source.facts),
    source.fetchedAt,
  );

  const row = database
    .prepare(`
      SELECT id, name, category, url, deadline, status, initials,
             facts_json, fetched_at, created_at
      FROM sources
      WHERE id = ?
    `)
    .get(source.id) as SourceRow | undefined;

  if (!row) {
    throw new Error("The saved source could not be read back.");
  }

  return rowToSource(row);
}


export type SourceSnapshot = {
  id: number;
  sourceId: string;
  contentHash: string;
  contentText: string;
  fetchedAt: string;
  changed: boolean;
  previousHash: string | null;
};

type SnapshotRow = {
  id: number;
  source_id: string;
  content_hash: string;
  content_text: string;
  fetched_at: string;
  changed: number;
  previous_hash: string | null;
};

function rowToSnapshot(row: SnapshotRow): SourceSnapshot {
  return {
    id: row.id,
    sourceId: row.source_id,
    contentHash: row.content_hash,
    contentText: row.content_text,
    fetchedAt: row.fetched_at,
    changed: row.changed === 1,
    previousHash: row.previous_hash,
  };
}

export function recordSnapshot(
  sourceId: string,
  text: string,
  fetchedAt: string,
): SourceSnapshot {
  if (!sourceId.trim()) {
    throw new Error("A source ID is required for a snapshot.");
  }

  if (!text.trim() || text.length > 12_000) {
    throw new Error("Snapshot text must contain between 1 and 12000 characters.");
  }

  // Ignore whitespace-only differences when comparing page versions.
  const normalizedText = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const contentHash = createHash("sha256")
    .update(normalizedText, "utf8")
    .digest("hex");

  const timestamp = Number.isFinite(Date.parse(fetchedAt))
    ? new Date(fetchedAt).toISOString()
    : new Date().toISOString();

  const database = getDatabase();

  const previous = database
    .prepare(
      `SELECT content_hash
       FROM source_snapshots
       WHERE source_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sourceId) as { content_hash: string } | undefined;

  const previousHash = previous?.content_hash ?? null;
  const changed = previousHash !== null && previousHash !== contentHash;

  database.prepare(
    `INSERT INTO source_snapshots (
       source_id, content_hash, content_text, fetched_at, changed, previous_hash
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    contentHash,
    normalizedText,
    timestamp,
    changed ? 1 : 0,
    previousHash,
  );

  const row = database
    .prepare(
      `SELECT id, source_id, content_hash, content_text,
              fetched_at, changed, previous_hash
       FROM source_snapshots
       WHERE source_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sourceId) as SnapshotRow | undefined;

  if (!row) {
    throw new Error("The saved snapshot could not be read back.");
  }

  return rowToSnapshot(row);
}

export function listSnapshots(
  sourceId: string,
  limit = 20,
): SourceSnapshot[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 20));

  const rows = getDatabase()
    .prepare(
      `SELECT id, source_id, content_hash, content_text,
              fetched_at, changed, previous_hash
       FROM source_snapshots
       WHERE source_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(sourceId, safeLimit) as unknown as SnapshotRow[];

  return rows.map(rowToSnapshot);
}


export type ChangeEvent = {
  id: number;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  detectedAt: string;
  previousDetectedAt: string | null;
  previousText: string | null;
  currentText: string;
  previousHash: string;
  currentHash: string;
};

type ChangeEventRow = {
  id: number;
  source_id: string;
  source_name: string;
  source_url: string;
  fetched_at: string;
  previous_fetched_at: string | null;
  previous_text: string | null;
  content_text: string;
  previous_hash: string;
  content_hash: string;
};

export function listChangeEvents(limit = 50): ChangeEvent[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));

  const rows = getDatabase()
    .prepare(`
      SELECT
        cur.id,
        cur.source_id,
        src.name AS source_name,
        src.url AS source_url,
        cur.fetched_at,
        (
          SELECT prev.fetched_at
          FROM source_snapshots AS prev
          WHERE prev.source_id = cur.source_id
            AND prev.id < cur.id
            AND prev.content_hash = cur.previous_hash
          ORDER BY prev.id DESC
          LIMIT 1
        ) AS previous_fetched_at,
        (
          SELECT prev.content_text
          FROM source_snapshots AS prev
          WHERE prev.source_id = cur.source_id
            AND prev.id < cur.id
            AND prev.content_hash = cur.previous_hash
          ORDER BY prev.id DESC
          LIMIT 1
        ) AS previous_text,
        cur.content_text,
        cur.previous_hash,
        cur.content_hash
      FROM source_snapshots AS cur
      INNER JOIN sources AS src ON src.id = cur.source_id
      WHERE cur.changed = 1
      ORDER BY cur.id DESC
      LIMIT ?
    `)
    .all(safeLimit) as unknown as ChangeEventRow[];

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    detectedAt: row.fetched_at,
    previousDetectedAt: row.previous_fetched_at,
    previousText: row.previous_text,
    currentText: row.content_text,
    previousHash: row.previous_hash,
    currentHash: row.content_hash,
  }));
}
