import neo4j, { Driver, Session, Record as Neo4jRecord } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      import.meta.env.VITE_NEO4J_URI || "bolt://127.0.0.1:7687",
      neo4j.auth.basic(
        import.meta.env.VITE_NEO4J_USER || "neo4j",
        import.meta.env.VITE_NEO4J_PASSWORD || ""
      )
    );
  }
  return driver;
}

// ── Query audit log ────────────────────────────────────────────

export interface QueryLogEntry {
  id: number;
  timestamp: Date;
  cypher: string;
  params: Record<string, unknown>;
  durationMs: number;
  rowCount: number;
  error?: string;
}

let _logCounter = 0;
let _queryLog: QueryLogEntry[] = [];
const _listeners: Set<() => void> = new Set();

export function getQueryLog(): QueryLogEntry[] {
  return _queryLog;
}

export function clearQueryLog(): void {
  _queryLog = [];
  _notifyListeners();
}

export function onQueryLogChange(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notifyListeners() {
  _listeners.forEach((fn) => fn());
}

// ── Run query with logging ─────────────────────────────────────

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session: Session = getDriver().session();
  const start = performance.now();
  const entryId = ++_logCounter;

  try {
    const result = await session.run(cypher, params);
    const rows = result.records.map((r: Neo4jRecord) => {
      const obj: Record<string, unknown> = {};
      r.keys.forEach((key) => {
        const val = r.get(key);
        obj[key as string] = toJS(val);
      });
      return obj as T;
    });

    _queryLog = [
      ..._queryLog,
      {
        id: entryId,
        timestamp: new Date(),
        cypher: cypher.trim(),
        params,
        durationMs: Math.round(performance.now() - start),
        rowCount: rows.length,
      },
    ];
    _notifyListeners();

    return rows;
  } catch (e: unknown) {
    _queryLog = [
      ..._queryLog,
      {
        id: entryId,
        timestamp: new Date(),
        cypher: cypher.trim(),
        params,
        durationMs: Math.round(performance.now() - start),
        rowCount: 0,
        error: (e as Error).message,
      },
    ];
    _notifyListeners();
    throw e;
  } finally {
    await session.close();
  }
}

// Convert Neo4j types to plain JS
function toJS(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (neo4j.isInt(val)) return val.toNumber();
  if (typeof val === "object" && val !== null) {
    if (Array.isArray(val)) return val.map(toJS);
    if ("low" in val && "high" in val) return neo4j.integer.toNumber(val as neo4j.Integer);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = toJS(v);
    }
    return out;
  }
  return val;
}
