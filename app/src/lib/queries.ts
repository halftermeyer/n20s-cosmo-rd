import { runQuery } from "./neo4j";

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
  // Build co-occurrence, project, run Louvain, clean up
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
  const safeName = ingredientName.replace(/[^a-zA-Z0-9]/g, "");
  const rows = await runQuery<{ className: string }>(`
    MATCH (i:Ingredient {name: $name})
    CALL n20s.graph.addTurtle('explore_tmp', i.turtle)
    YIELD graphName
    WITH graphName
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle('explore_tmp', ont.turtle)
    YIELD graphName AS g2
    WITH g2
    CALL n20s.graph.query('explore_tmp', '
      PREFIX cosmo: <http://example.org/cosmo#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?className WHERE {
        cosmo:${safeName} rdf:type ?className .
        FILTER(STRSTARTS(STR(?className), "http://example.org/cosmo#"))
      }
    ', 'RDFS') YIELD row
    WITH replace(row.className, 'http://example.org/cosmo#', '') AS className
    RETURN className
  `, { name: ingredientName });
  // Cleanup
  await runQuery(`CALL n20s.graph.drop('explore_tmp') YIELD graphName RETURN graphName`).catch(() => {});
  return rows.map(r => r.className);
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
  // Clean any existing graph
  await runQuery(
    `CALL n20s.graph.drop('validation') YIELD graphName RETURN graphName`
  ).catch(() => {});

  // Load ingredient turtles
  const names = ingredients.map((i) => i.name);
  await runQuery(
    `
    MATCH (i:Ingredient) WHERE i.name IN $names
    WITH collect(i.turtle) AS turtles
    UNWIND turtles AS t
    CALL n20s.graph.addTurtle('validation', t)
    YIELD graphName, added
    RETURN graphName, sum(added) AS total
  `,
    { names }
  );

  // Build concentration turtle
  const concLines = ingredients
    .map((i) => {
      const safeName = i.name.replace(/[^a-zA-Z0-9]/g, "");
      return `cosmo:${safeName} cosmo:actualConcentration "${i.concentration}"^^xsd:double .`;
    })
    .join("\n");

  const concTurtle = `@prefix cosmo: <http://example.org/cosmo#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${concLines}`;

  await runQuery(`
    CALL n20s.graph.addTurtle('validation', $turtle)
    YIELD graphName, added
    RETURN added
  `, { turtle: concTurtle });

  // Add ontology + SHACL
  await runQuery(`
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle('validation', ont.turtle)
    YIELD graphName, added
    RETURN added
  `);

  await runQuery(`
    MATCH (sh:SHACLRules {name: 'cosmo_validation'})
    CALL n20s.graph.addTurtle('validation', sh.turtle)
    YIELD graphName, added
    RETURN added
  `);

  // Run rules check — all 4 markets in one pass
  const violations = await runQuery<Violation>(`
    CALL n20s.graph.queryWithRules('validation', '
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
    ', '
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
    ', 'RDFS') YIELD row
    RETURN row.label AS label, row.actual AS actual, row.limit AS limit, row.market AS market
  `);

  // Run SHACL validation
  const shacl = await runQuery<SHACLResult>(`
    CALL n20s.graph.validate('validation')
    YIELD focusNode, severity, message
    RETURN focusNode, severity, message
  `);

  // Cleanup
  await runQuery(
    `CALL n20s.graph.drop('validation') YIELD graphName RETURN graphName`
  ).catch(() => {});

  return { violations, shacl };
}

export async function exportTurtle(
  ingredients: { name: string; concentration: number }[]
): Promise<string> {
  // Clean any existing graph
  await runQuery(
    `CALL n20s.graph.drop('export') YIELD graphName RETURN graphName`
  ).catch(() => {});

  const names = ingredients.map((i) => i.name);
  await runQuery(
    `
    MATCH (i:Ingredient) WHERE i.name IN $names
    WITH collect(i.turtle) AS turtles
    UNWIND turtles AS t
    CALL n20s.graph.addTurtle('export', t)
    YIELD graphName, added
    RETURN sum(added) AS total
  `,
    { names }
  );

  // Add ontology
  await runQuery(`
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle('export', ont.turtle)
    YIELD graphName, added
    RETURN added
  `);

  // Forward-chain RDFS
  await runQuery(`
    CALL n20s.graph.infer('export', 'RDFS')
    YIELD newTriples
    RETURN newTriples
  `);

  // Export
  const rows = await runQuery<{ turtle: string }>(`
    CALL n20s.graph.toTurtle('export')
    YIELD turtle
    RETURN turtle
  `);

  await runQuery(
    `CALL n20s.graph.drop('export') YIELD graphName RETURN graphName`
  ).catch(() => {});

  return rows[0]?.turtle || "";
}
