import { runQuery, withGroup } from "./neo4j";
import {
  n20sAddTurtle, n20sAddTurtleBulk, n20sQuery, n20sQueryWithRules,
  n20sInfer, n20sValidate, n20sToTurtle, n20sDropSafe,
} from "./n20s";

// Helper: fetch a turtle property from Neo4j by Cypher
async function fetchTurtles(cypher: string, params: Record<string, unknown> = {}): Promise<string[]> {
  const rows = await runQuery<{ turtle: string }>(cypher, params);
  return rows.map((r) => r.turtle).filter(Boolean);
}

// Shared SPARQL + rules for multi-market validation
const MARKET_RULES = `
[eu_violation:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationEU ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  -> (?ing http://example.org/cosmo#violatesEU ?name)]
[us_violation:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationUS ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  -> (?ing http://example.org/cosmo#violatesUS ?name)]
[china_violation:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationChina ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  -> (?ing http://example.org/cosmo#violatesChina ?name)]
[japan_violation:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationJapan ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  -> (?ing http://example.org/cosmo#violatesJapan ?name)]
`;

const MARKET_SPARQL = `
PREFIX cosmo: <http://example.org/cosmo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?label ?actual ?limit ?market WHERE {
  { ?ing cosmo:violatesEU ?label . ?ing cosmo:actualConcentration ?actual . ?ing cosmo:maxConcentrationEU ?limit . BIND("EU" AS ?market) }
  UNION
  { ?ing cosmo:violatesUS ?label . ?ing cosmo:actualConcentration ?actual . ?ing cosmo:maxConcentrationUS ?limit . BIND("US" AS ?market) }
  UNION
  { ?ing cosmo:violatesChina ?label . ?ing cosmo:actualConcentration ?actual . ?ing cosmo:maxConcentrationChina ?limit . BIND("China" AS ?market) }
  UNION
  { ?ing cosmo:violatesJapan ?label . ?ing cosmo:actualConcentration ?actual . ?ing cosmo:maxConcentrationJapan ?limit . BIND("Japan" AS ?market) }
}
`;

// ── Types ──────────────────────────────────────────────────────

export interface Ingredient {
  name: string;
  inci: string;
  cas: string;
  cost: number;
  category: string;
  turtle: string;
}

export interface Product {
  name: string;
  sku: string;
  type: string;
  brand: string;
  line: string;
}

export interface BOMEntry {
  ingredient: string;
  pct: number;
}

export interface CoOccurrence {
  source: string;
  target: string;
  weight: number;
}

export interface CommunityMember {
  name: string;
  communityId: number;
  category: string;
}

export interface Violation {
  label: string;
  actual: number;
  limit: number;
  market: string;
}

export interface SHACLResult {
  focusNode: string;
  severity: string;
  message: string;
}

export interface IncompatibilityPair {
  a: string;
  b: string;
}

// ── Explore queries ────────────────────────────────────────────

export async function getIngredients(): Promise<Ingredient[]> {
  return runQuery<Ingredient>(`
    MATCH (i:Ingredient)-[:BELONGS_TO]->(c:Category)
    RETURN i.name AS name, i.inci AS inci, i.cas AS cas,
           i.cost AS cost, c.name AS category, i.turtle AS turtle
    ORDER BY c.name, i.name
  `);
}

export async function getCategories(): Promise<string[]> {
  const rows = await runQuery<{ name: string }>(`
    MATCH (c:Category) RETURN c.name AS name ORDER BY c.name
  `);
  return rows.map((r) => r.name);
}

export async function getProducts(): Promise<Product[]> {
  return runQuery<Product>(`
    MATCH (p:Product)-[:PRODUCED_BY]->(b:Brand)
    OPTIONAL MATCH (p)-[:IN_LINE]->(pl:ProductLine)
    RETURN p.name AS name, p.sku AS sku, p.type AS type,
           b.name AS brand, pl.name AS line
    ORDER BY brand, name
  `);
}

export async function getProductBOM(sku: string): Promise<BOMEntry[]> {
  return runQuery<BOMEntry>(
    `
    MATCH path = (p:Product {sku: $sku})-[:CONTAINS*]->(i:Ingredient)
    WITH i.name AS ingredient,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
    RETURN ingredient, round(finalConc * 100, 4) AS pct
    ORDER BY pct DESC
  `,
    { sku }
  );
}

export interface BOMGraphNode {
  id: string;
  label: string;
  type: string; // Product, Phase, PreMix, Ingredient
}

export interface BOMGraphRel {
  source: string;
  target: string;
  ratio: number;
}

export async function getProductBOMGraph(sku: string): Promise<{ nodes: BOMGraphNode[]; rels: BOMGraphRel[] }> {
  const rows = await runQuery<{
    srcId: string; srcName: string; srcLabel: string;
    tgtId: string; tgtName: string; tgtLabel: string;
    ratio: number;
  }>(
    `
    MATCH (p:Product {sku: $sku})-[r:CONTAINS]->(child)
    RETURN elementId(p) AS srcId, p.name AS srcName, labels(p)[0] AS srcLabel,
           elementId(child) AS tgtId, child.name AS tgtName, labels(child)[0] AS tgtLabel,
           r.ratio AS ratio
    UNION ALL
    MATCH (p:Product {sku: $sku})-[:CONTAINS]->(ph)-[r:CONTAINS]->(child)
    RETURN elementId(ph) AS srcId, ph.name AS srcName, labels(ph)[0] AS srcLabel,
           elementId(child) AS tgtId, child.name AS tgtName, labels(child)[0] AS tgtLabel,
           r.ratio AS ratio
    UNION ALL
    MATCH (p:Product {sku: $sku})-[:CONTAINS]->()-[:CONTAINS]->(pm:PreMix)-[r:CONTAINS]->(child)
    RETURN elementId(pm) AS srcId, pm.name AS srcName, labels(pm)[0] AS srcLabel,
           elementId(child) AS tgtId, child.name AS tgtName, labels(child)[0] AS tgtLabel,
           r.ratio AS ratio
  `,
    { sku }
  );

  const nodeMap = new Map<string, BOMGraphNode>();
  const rels: BOMGraphRel[] = [];

  for (const row of rows) {
    if (!nodeMap.has(row.srcId)) {
      nodeMap.set(row.srcId, { id: row.srcId, label: row.srcName, type: row.srcLabel });
    }
    if (!nodeMap.has(row.tgtId)) {
      nodeMap.set(row.tgtId, { id: row.tgtId, label: row.tgtName, type: row.tgtLabel });
    }
    rels.push({ source: row.srcId, target: row.tgtId, ratio: row.ratio });
  }

  return { nodes: Array.from(nodeMap.values()), rels };
}

export async function getCommunities(): Promise<CommunityMember[]> {
  return withGroup("GDS Community Detection", async () => {
  await runQuery(`
    MATCH (i1:Ingredient)<-[:CONTAINS*]-(p:Product)-[:CONTAINS*]->(i2:Ingredient)
    WHERE elementId(i1) < elementId(i2)
    WITH i1, i2, count(DISTINCT p) AS coCount
    MERGE (i1)-[r:CO_OCCURS]-(i2)
    SET r.weight = coCount
  `);

  await runQuery(`
    CALL gds.graph.drop('ing-cooc', false) YIELD graphName RETURN graphName
  `).catch(() => {});

  await runQuery(`
    CALL gds.graph.project(
      'ing-cooc', 'Ingredient',
      {CO_OCCURS: {properties: 'weight', orientation: 'UNDIRECTED'}}
    ) YIELD graphName RETURN graphName
  `);

  const communities = await runQuery<CommunityMember>(`
    CALL gds.louvain.stream('ing-cooc', {relationshipWeightProperty: 'weight'})
    YIELD nodeId, communityId
    WITH gds.util.asNode(nodeId) AS node, communityId
    MATCH (node)-[:BELONGS_TO]->(c:Category)
    RETURN node.name AS name, communityId, c.name AS category
  `);

  await runQuery(`CALL gds.graph.drop('ing-cooc', false) YIELD graphName RETURN graphName`).catch(() => {});
  await runQuery(`MATCH ()-[r:CO_OCCURS]-() DELETE r`);

  return communities;
  });
}

export async function getIncompatibilities(): Promise<IncompatibilityPair[]> {
  return runQuery<IncompatibilityPair>(`
    MATCH (a:Ingredient)-[:INCOMPATIBLE_WITH]->(b:Ingredient)
    WHERE elementId(a) < elementId(b)
    RETURN a.name AS a, b.name AS b
  `);
}

// ── Explore: RDF classification via n20s ───────────────────────

export async function getRDFClassification(ingredientName: string): Promise<string[]> {
  return withGroup(`RDFS Classification: ${ingredientName}`, async () => {
    const g = "explore_tmp";
    const safeName = ingredientName.replace(/[^a-zA-Z0-9]/g, "");
    await n20sDropSafe(g);

    // Fetch turtles from Neo4j, then load into n20s
    const [ingTurtles, ontTurtles] = await Promise.all([
      fetchTurtles(`MATCH (i:Ingredient {name: $name}) RETURN i.turtle AS turtle`, { name: ingredientName }),
      fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`),
    ]);
    await n20sAddTurtleBulk(g, [...ingTurtles, ...ontTurtles]);

    // RDFS query
    const rows = await n20sQuery(g, `
      PREFIX cosmo: <http://example.org/cosmo#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?className WHERE {
        cosmo:${safeName} rdf:type ?className .
        FILTER(STRSTARTS(STR(?className), "http://example.org/cosmo#"))
      }
    `, "RDFS");

    await n20sDropSafe(g);
    return rows.map((r) =>
      String(r.className).replace("http://example.org/cosmo#", "")
    );
  });
}

// ── Formulate queries ──────────────────────────────────────────

export async function getIngredientsByCategory(category: string): Promise<Ingredient[]> {
  return runQuery<Ingredient>(
    `
    MATCH (i:Ingredient)-[:BELONGS_TO]->(c:Category {name: $category})
    RETURN i.name AS name, i.inci AS inci, i.cas AS cas,
           i.cost AS cost, c.name AS category, i.turtle AS turtle
    ORDER BY i.name
  `,
    { category }
  );
}

export async function checkIncompatibility(
  names: string[]
): Promise<IncompatibilityPair[]> {
  return runQuery<IncompatibilityPair>(
    `
    UNWIND $names AS n1
    UNWIND $names AS n2
    WITH n1, n2 WHERE n1 < n2
    MATCH (a:Ingredient {name: n1})-[:INCOMPATIBLE_WITH]-(b:Ingredient {name: n2})
    RETURN DISTINCT a.name AS a, b.name AS b
  `,
    { names }
  );
}

// ── Validate queries ───────────────────────────────────────────

export async function validateCandidate(
  ingredients: { name: string; concentration: number }[]
): Promise<{ violations: Violation[]; shacl: SHACLResult[] }> {
  return withGroup("n20s Compliance Check", async () => {
    const g = "validation";
    await n20sDropSafe(g);

    // Fetch turtles from Neo4j
    const names = ingredients.map((i) => i.name);
    const [ingTurtles, ontTurtles, shaclTurtles] = await Promise.all([
      fetchTurtles(`MATCH (i:Ingredient) WHERE i.name IN $names RETURN i.turtle AS turtle`, { names }),
      fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`),
      fetchTurtles(`MATCH (s:SHACLRules {name: 'cosmo_validation'}) RETURN s.turtle AS turtle`),
    ]);

    // Load all turtles + concentration triples in one aggregation
    const concLines = ingredients.map((i) => {
      const safeName = i.name.replace(/[^a-zA-Z0-9]/g, "");
      return `cosmo:${safeName} cosmo:actualConcentration "${i.concentration}"^^xsd:double .`;
    }).join("\n");
    const concTurtle = `@prefix cosmo: <http://example.org/cosmo#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${concLines}`;

    await n20sAddTurtleBulk(g, [...ingTurtles, ...ontTurtles, ...shaclTurtles, concTurtle]);

    // Run rules + SHACL
    const ruleRows = await n20sQueryWithRules(g, MARKET_SPARQL, MARKET_RULES, "RDFS");
    const violations: Violation[] = ruleRows.map((r) => ({
      label: String(r.label),
      actual: Number(r.actual),
      limit: Number(r.limit),
      market: String(r.market),
    }));

    const shaclRows = await n20sValidate(g);
    const shacl: SHACLResult[] = shaclRows
      .filter((s) => s.focusNode != null)
      .map((s) => ({
        focusNode: String(s.focusNode),
        severity: String(s.severity),
        message: String(s.message),
      }));

    await n20sDropSafe(g);
    return { violations, shacl };
  });
}

export async function exportTurtle(
  ingredients: { name: string; concentration: number }[]
): Promise<string> {
  return withGroup("Turtle Export for Audit", async () => {
    const g = "export";
    await n20sDropSafe(g);

    const names = ingredients.map((i) => i.name);
    const [ingTurtles, ontTurtles] = await Promise.all([
      fetchTurtles(`MATCH (i:Ingredient) WHERE i.name IN $names RETURN i.turtle AS turtle`, { names }),
      fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`),
    ]);

    await n20sAddTurtleBulk(g, [...ingTurtles, ...ontTurtles]);
    await n20sInfer(g, "RDFS");
    const turtle = await n20sToTurtle(g);
    await n20sDropSafe(g);
    return turtle;
  });
}
