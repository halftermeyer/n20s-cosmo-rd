/**
 * n20s abstraction layer — supports two modes:
 * - Plugin mode (default): CALL n20s.graph.*() procedures in Cypher
 * - Server mode: direct HTTP calls to n20s-server REST API
 *
 * Server-mode HTTP calls are logged to the same audit log as Cypher queries.
 */

import { runQuery, pushLogEntry } from "./neo4j";

type N20sMode = "plugin" | "server";

const mode: N20sMode = (import.meta.env.VITE_N20S_MODE as N20sMode) || "plugin";
const serverUrl: string = import.meta.env.PROD
  ? (import.meta.env.VITE_N20S_URL || "http://localhost:7475")
  : "/n20s";

// ── Server HTTP helpers (with audit logging) ───────────────────

async function serverPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const start = performance.now();
  const res = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - start);
  if (!res.ok) {
    const errText = await res.text();
    logCall("POST", path, body, ms, 0, undefined, `${res.status} ${errText}`);
    throw new Error(`n20s-server ${path}: ${res.status} ${errText}`);
  }
  const data = await res.json() as T;
  const count = Array.isArray(data) ? data.length : 1;
  logCall("POST", path, body, ms, count, data);
  return data;
}

async function serverGet<T>(path: string): Promise<T> {
  const start = performance.now();
  const res = await fetch(`${serverUrl}${path}`);
  const ms = Math.round(performance.now() - start);
  if (!res.ok) {
    const errText = await res.text();
    logCall("GET", path, {}, ms, 0, undefined, `${res.status} ${errText}`);
    throw new Error(`n20s-server ${path}: ${res.status} ${errText}`);
  }
  const data = await res.json() as T;
  logCall("GET", path, {}, ms, 1, data);
  return data;
}

async function serverDelete(path: string): Promise<void> {
  const start = performance.now();
  const res = await fetch(`${serverUrl}${path}`, { method: "DELETE" });
  const ms = Math.round(performance.now() - start);
  if (!res.ok && res.status !== 404) {
    logCall("DELETE", path, {}, ms, 0, undefined, `${res.status}`);
    throw new Error(`n20s-server ${path}: ${res.status}`);
  }
  logCall("DELETE", path, {}, ms, 1, { status: res.status === 404 ? "not found" : "dropped" });
}

function logCall(
  method: string, path: string, body: Record<string, unknown>,
  durationMs: number, rowCount: number, result?: unknown, error?: string,
) {
  const resultArr = Array.isArray(result) ? result.slice(0, 20) : result ? [result] : [];
  pushLogEntry({
    timestamp: new Date(),
    cypher: `// n20s-server: ${method} ${path}`,
    params: Object.keys(body).length > 0 ? body : {},
    durationMs,
    rowCount,
    results: resultArr as unknown[],
    error,
  });
}

// ── Public API ─────────────────────────────────────────────────

export async function n20sAddTurtle(graphName: string, turtle: string): Promise<number> {
  if (mode === "server") {
    const result = await serverPost<{ graphName: string; added: number }>(
      `/graph/${graphName}/turtle`, { turtle }
    );
    return result.added;
  }
  const rows = await runQuery<{ added: number }>(`
    CALL n20s.graph.addTurtle($g, $turtle)
    YIELD graphName, added RETURN added
  `, { g: graphName, turtle });
  return rows[0]?.added || 0;
}

/** Load multiple turtles in one shot using the aggregating function (v1.1.0+) */
export async function n20sAddTurtleBulk(graphName: string, turtles: string[]): Promise<number> {
  if (turtles.length === 0) return 0;
  if (mode === "server") {
    // Batch endpoint: send array of turtle strings in one POST
    const result = await serverPost<{ graphName: string; added: number }>(
      `/graph/${graphName}/turtle`, { turtles }
    );
    return result.added;
  }
  // Plugin: use the aggregating function — single Cypher round trip
  const rows = await runQuery<{ added: number }>(`
    UNWIND $turtles AS t
    WITH n20s.graph.addTurtle($g, t) AS g
    RETURN g.added AS added
  `, { g: graphName, turtles });
  return rows[0]?.added || 0;
}

export async function n20sQuery(
  graphName: string,
  sparql: string,
  profile?: string
): Promise<Record<string, unknown>[]> {
  if (mode === "server") {
    const body: Record<string, string> = { sparql };
    if (profile) body.profile = profile;
    const rows = await serverPost<{ row: Record<string, unknown> }[]>(`/graph/${graphName}/query`, body);
    return rows.map((r) => r.row);
  }
  const cypher = profile
    ? `CALL n20s.graph.query($g, $sparql, $profile) YIELD row RETURN row`
    : `CALL n20s.graph.query($g, $sparql) YIELD row RETURN row`;
  const rows = await runQuery<{ row: Record<string, unknown> }>(cypher, { g: graphName, sparql, profile });
  return rows.map((r) => r.row);
}

export async function n20sQueryWithRules(
  graphName: string,
  sparql: string,
  rules: string,
  profile?: string
): Promise<Record<string, unknown>[]> {
  if (mode === "server") {
    const body: Record<string, string> = { sparql, rules };
    if (profile) body.profile = profile;
    const rows = await serverPost<{ row: Record<string, unknown> }[]>(`/graph/${graphName}/queryWithRules`, body);
    return rows.map((r) => r.row);
  }
  const cypher = profile
    ? `CALL n20s.graph.queryWithRules($g, $sparql, $rules, $profile) YIELD row RETURN row`
    : `CALL n20s.graph.queryWithRules($g, $sparql, $rules) YIELD row RETURN row`;
  const rows = await runQuery<{ row: Record<string, unknown> }>(cypher, { g: graphName, sparql, rules, profile });
  return rows.map((r) => r.row);
}

export async function n20sInfer(
  graphName: string, profile: string
): Promise<{ triplesBefore: number; triplesAfter: number; newTriples: number }> {
  if (mode === "server") {
    return serverPost(`/graph/${graphName}/infer`, { profile });
  }
  const rows = await runQuery<{ triplesBefore: number; triplesAfter: number; newTriples: number }>(`
    CALL n20s.graph.infer($g, $profile)
    YIELD triplesBefore, triplesAfter, newTriples
    RETURN triplesBefore, triplesAfter, newTriples
  `, { g: graphName, profile });
  return rows[0] || { triplesBefore: 0, triplesAfter: 0, newTriples: 0 };
}

export async function n20sValidate(
  graphName: string
): Promise<{ focusNode: string | null; severity: string; message: string }[]> {
  if (mode === "server") {
    const start = performance.now();
    const res = await fetch(`${serverUrl}/graph/${graphName}/validate`, { method: "POST" });
    const ms = Math.round(performance.now() - start);
    if (!res.ok) {
      const errText = await res.text();
      logCall("POST", `/graph/${graphName}/validate`, {}, ms, 0, undefined, `${res.status} ${errText}`);
      throw new Error(`n20s-server validate: ${res.status} ${errText}`);
    }
    const data = await res.json();
    logCall("POST", `/graph/${graphName}/validate`, {}, ms, Array.isArray(data) ? data.length : 1, data);
    return data;
  }
  return runQuery<{ focusNode: string | null; severity: string; message: string }>(`
    CALL n20s.graph.validate($g)
    YIELD focusNode, severity, message
    RETURN focusNode, severity, message
  `, { g: graphName });
}

export async function n20sToTurtle(graphName: string): Promise<string> {
  if (mode === "server") {
    const result = await serverGet<{ turtle: string }>(`/graph/${graphName}/turtle`);
    return result.turtle;
  }
  const rows = await runQuery<{ turtle: string }>(`
    CALL n20s.graph.toTurtle($g) YIELD turtle RETURN turtle
  `, { g: graphName });
  return rows[0]?.turtle || "";
}

export async function n20sDrop(graphName: string): Promise<void> {
  if (mode === "server") {
    await serverDelete(`/graph/${graphName}`);
    return;
  }
  await runQuery(`
    CALL n20s.graph.drop($g) YIELD graphName RETURN graphName
  `, { g: graphName }).catch(() => {});
}

export async function n20sDropSafe(graphName: string): Promise<void> {
  try { await n20sDrop(graphName); } catch { /* ignore */ }
}

export function getN20sMode(): N20sMode { return mode; }
export function getN20sServerUrl(): string { return serverUrl; }

/** Generate a unique graph name to avoid concurrent conflicts */
export function uniqueGraphName(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

const INGREDIENT_ROW_CYPHER = (whereClause: string) => `
  MATCH (t:Template {name: 'ingredient_mapping'})
  WITH t.template AS tmpl
  MATCH (i:Ingredient)${whereClause}
  UNWIND i.rdfClasses AS rdfClass
  WITH tmpl,
       {safeName: i.safeName, name: i.name, inci: i.inci, cas: i.cas, rdfClass: rdfClass,
        maxConcentrationEU: i.maxConcentrationEU, maxConcentrationUS: i.maxConcentrationUS,
        maxConcentrationChina: i.maxConcentrationChina, maxConcentrationJapan: i.maxConcentrationJapan} AS row
  WITH n20s.graph.projectTemplate($g, tmpl, row) AS result
  RETURN result.added AS added
`;

/** Project named ingredients into a graph using the stored template */
export async function n20sProjectTemplate(
  graphName: string,
  names: string[]
): Promise<number> {
  if (mode === "server") {
    const [rowResults, tplResults] = await Promise.all([
      runQuery<{ row: Record<string, unknown> }>(`
        MATCH (i:Ingredient) WHERE i.name IN $names
        UNWIND i.rdfClasses AS rdfClass
        RETURN {safeName: i.safeName, name: i.name, inci: i.inci, cas: i.cas, rdfClass: rdfClass,
                maxConcentrationEU: i.maxConcentrationEU, maxConcentrationUS: i.maxConcentrationUS,
                maxConcentrationChina: i.maxConcentrationChina, maxConcentrationJapan: i.maxConcentrationJapan} AS row
      `, { names }),
      runQuery<{ template: string }>(`MATCH (t:Template {name: 'ingredient_mapping'}) RETURN t.template AS template`),
    ]);
    const result = await serverPost<{ graphName: string; added: number }>(
      `/graph/${graphName}/projectTemplate`,
      { template: tplResults[0]?.template || "", rows: rowResults.map((r) => r.row), ifExists: "replace" }
    );
    return result.added;
  }
  const rows = await runQuery<{ added: number }>(
    INGREDIENT_ROW_CYPHER(" WHERE i.name IN $names"),
    { g: graphName, names }
  );
  return rows[0]?.added || 0;
}

/** Project all ingredients into a graph using the stored template */
export async function n20sProjectTemplateAll(graphName: string): Promise<number> {
  if (mode === "server") {
    const [rowResults, tplResults] = await Promise.all([
      runQuery<{ row: Record<string, unknown> }>(`
        MATCH (i:Ingredient)
        UNWIND i.rdfClasses AS rdfClass
        RETURN {safeName: i.safeName, name: i.name, inci: i.inci, cas: i.cas, rdfClass: rdfClass,
                maxConcentrationEU: i.maxConcentrationEU, maxConcentrationUS: i.maxConcentrationUS,
                maxConcentrationChina: i.maxConcentrationChina, maxConcentrationJapan: i.maxConcentrationJapan} AS row
      `),
      runQuery<{ template: string }>(`MATCH (t:Template {name: 'ingredient_mapping'}) RETURN t.template AS template`),
    ]);
    const result = await serverPost<{ graphName: string; added: number }>(
      `/graph/${graphName}/projectTemplate`,
      { template: tplResults[0]?.template || "", rows: rowResults.map((r) => r.row), ifExists: "replace" }
    );
    return result.added;
  }
  const rows = await runQuery<{ added: number }>(
    INGREDIENT_ROW_CYPHER(""),
    { g: graphName }
  );
  return rows[0]?.added || 0;
}
