/**
 * n20s abstraction layer — supports two modes:
 * - Plugin mode (default): CALL n20s.graph.*() procedures in Cypher
 * - Server mode: direct HTTP calls to n20s-server REST API
 *
 * Set VITE_N20S_MODE=server and VITE_N20S_URL=http://localhost:7475 in .env
 * to use the standalone n20s-server instead of the Neo4j plugin.
 *
 * Server mode calls the n20s-server directly from the browser via fetch.
 * When APOC Extended is available, this could be done via apoc.load.jsonParams
 * from Cypher instead — but direct fetch is simpler and works without extra plugins.
 */

import { runQuery } from "./neo4j";

type N20sMode = "plugin" | "server";

const mode: N20sMode = (import.meta.env.VITE_N20S_MODE as N20sMode) || "plugin";
// In dev, requests go through the Vite proxy (/n20s/* → n20s-server) to avoid CORS.
// In production, set VITE_N20S_URL to the actual server URL.
const serverUrl: string = import.meta.env.PROD
  ? (import.meta.env.VITE_N20S_URL || "http://localhost:7475")
  : "/n20s";

// ── Server HTTP helpers ────────────────────────────────────────

async function serverPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`n20s-server ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function serverGet<T>(path: string): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`);
  if (!res.ok) throw new Error(`n20s-server ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function serverDelete(path: string): Promise<void> {
  const res = await fetch(`${serverUrl}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`n20s-server ${path}: ${res.status} ${await res.text()}`);
  }
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

export async function n20sQuery(
  graphName: string,
  sparql: string,
  profile?: string
): Promise<Record<string, unknown>[]> {
  if (mode === "server") {
    const body: Record<string, string> = { sparql };
    if (profile) body.reasoningProfile = profile;
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
    if (profile) body.reasoningProfile = profile;
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
    // Server validate endpoint takes no body
    const res = await fetch(`${serverUrl}/graph/${graphName}/validate`, { method: "POST" });
    if (!res.ok) throw new Error(`n20s-server validate: ${res.status} ${await res.text()}`);
    return res.json();
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
