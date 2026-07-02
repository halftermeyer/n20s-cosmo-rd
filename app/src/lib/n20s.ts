/**
 * n20s abstraction layer — generates Cypher for either:
 * - Plugin mode: CALL n20s.graph.*() procedures
 * - Server mode: CALL apoc.load.jsonParams() targeting n20s-server REST API
 *
 * Set VITE_N20S_MODE=server and VITE_N20S_URL=http://localhost:7474 in .env
 * to use the standalone n20s-server via APOC instead of the Neo4j plugin.
 */

import { runQuery } from "./neo4j";

type N20sMode = "plugin" | "server";

const mode: N20sMode = (import.meta.env.VITE_N20S_MODE as N20sMode) || "plugin";
const serverUrl: string = import.meta.env.VITE_N20S_URL || "http://localhost:7474";

// ── Public API ─────────────────────────────────────────────────

export async function n20sAddTurtle(graphName: string, turtle: string): Promise<number> {
  if (mode === "server") {
    const rows = await runQuery<{ added: number }>(`
      CALL apoc.load.jsonParams($url, {method: 'POST', \`Content-Type\`: 'application/json'},
        {turtle: $turtle}) YIELD value
      RETURN value.added AS added
    `, { url: `${serverUrl}/graph/${graphName}/turtle`, turtle });
    return rows[0]?.added || 0;
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
    if (profile) body.profile = profile;
    const rows = await runQuery<{ value: Record<string, unknown> }>(`
      CALL apoc.load.jsonParams($url, {method: 'POST', \`Content-Type\`: 'application/json'},
        $body) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}/query`, body });
    return rows.map((r) => r.value);
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
    const rows = await runQuery<{ value: Record<string, unknown> }>(`
      CALL apoc.load.jsonParams($url, {method: 'POST', \`Content-Type\`: 'application/json'},
        $body) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}/queryWithRules`, body });
    return rows.map((r) => r.value);
  }
  const cypher = profile
    ? `CALL n20s.graph.queryWithRules($g, $sparql, $rules, $profile) YIELD row RETURN row`
    : `CALL n20s.graph.queryWithRules($g, $sparql, $rules) YIELD row RETURN row`;
  const rows = await runQuery<{ row: Record<string, unknown> }>(cypher, { g: graphName, sparql, rules, profile });
  return rows.map((r) => r.row);
}

export async function n20sInfer(graphName: string, profile: string): Promise<{ triplesBefore: number; triplesAfter: number; newTriples: number }> {
  if (mode === "server") {
    const rows = await runQuery<{ value: { triplesBefore: number; triplesAfter: number; newTriples: number } }>(`
      CALL apoc.load.jsonParams($url, {method: 'POST', \`Content-Type\`: 'application/json'},
        {profile: $profile}) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}/infer`, profile });
    return rows[0]?.value || { triplesBefore: 0, triplesAfter: 0, newTriples: 0 };
  }
  const rows = await runQuery<{ triplesBefore: number; triplesAfter: number; newTriples: number }>(`
    CALL n20s.graph.infer($g, $profile)
    YIELD triplesBefore, triplesAfter, newTriples
    RETURN triplesBefore, triplesAfter, newTriples
  `, { g: graphName, profile });
  return rows[0] || { triplesBefore: 0, triplesAfter: 0, newTriples: 0 };
}

export async function n20sValidate(graphName: string): Promise<{ focusNode: string | null; severity: string; message: string }[]> {
  if (mode === "server") {
    const rows = await runQuery<{ value: { focusNode: string | null; severity: string; message: string } }>(`
      CALL apoc.load.jsonParams($url, {method: 'POST', \`Content-Type\`: 'application/json'},
        {}) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}/validate` });
    return rows.map((r) => r.value);
  }
  return runQuery<{ focusNode: string | null; severity: string; message: string }>(`
    CALL n20s.graph.validate($g)
    YIELD focusNode, severity, message
    RETURN focusNode, severity, message
  `, { g: graphName });
}

export async function n20sToTurtle(graphName: string): Promise<string> {
  if (mode === "server") {
    const rows = await runQuery<{ value: { turtle: string } }>(`
      CALL apoc.load.jsonParams($url, {method: 'GET'}, null) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}/turtle` });
    return rows[0]?.value?.turtle || "";
  }
  const rows = await runQuery<{ turtle: string }>(`
    CALL n20s.graph.toTurtle($g) YIELD turtle RETURN turtle
  `, { g: graphName });
  return rows[0]?.turtle || "";
}

export async function n20sDrop(graphName: string): Promise<void> {
  if (mode === "server") {
    await runQuery(`
      CALL apoc.load.jsonParams($url, {method: 'DELETE'}, null) YIELD value
      RETURN value
    `, { url: `${serverUrl}/graph/${graphName}` }).catch(() => {});
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
