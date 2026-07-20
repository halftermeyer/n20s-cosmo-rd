import { runQuery, withGroup } from "./neo4j";
import {
  n20sAddTurtle, n20sAddTurtleBulk, n20sQuery, n20sQueryWithRules,
  n20sValidate, n20sDropSafe, uniqueGraphName,
  n20sProjectTemplate, n20sProjectTemplateAll,
} from "./n20s";
import { safeName } from "./queries";

// Helper: fetch turtle properties from Neo4j
async function fetchTurtles(cypher: string, params: Record<string, unknown> = {}): Promise<string[]> {
  const rows = await runQuery<{ turtle: string }>(cypher, params);
  return rows.map((r) => r.turtle).filter(Boolean);
}

// Shared multi-market rules
const MARKET_RULES = `
[eu: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationEU ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesEU ?n)]
[us: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationUS ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesUS ?n)]
[cn: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationChina ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesChina ?n)]
[jp: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationJapan ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesJapan ?n)]
`;

const MARKET_SPARQL = `
PREFIX cosmo: <http://example.org/cosmo#>
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

// ═══════════════════════════════════════════════════════════════
// Scenario 1: Regulatory Change Impact Analysis
// "EU just lowered Retinol limit from 5% to 3%. Which products break?"
//
// Pattern: Market ← SOLD_IN ← Product → CONTAINS* → Ingredient
//          Cypher computes concentrations via BOM traversal
//          n20s fires greaterThan rule with the NEW limit
// ═══════════════════════════════════════════════════════════════

export interface RegulatoryImpact {
  product: string;
  sku: string;
  ingredient: string;
  actualPct: number;
  oldLimitPct: number;
  newLimitPct: number;
  status: "newly_violated" | "already_violated" | "safe";
}

export async function runRegulatoryChangeImpact(
  market: string,
  ingredientClass: string, // e.g. "RetinoidAgent"
  newLimitFraction: number
): Promise<RegulatoryImpact[]> {
  return withGroup(`Regulatory Impact: ${market} ${ingredientClass} @ ${(newLimitFraction*100).toFixed(1)}%`, async () => {
  // Step 1: Cypher deep traversal — find all products sold in this market
  // that contain ingredients of the given class, compute concentrations
  const rows = await runQuery<{
    product: string;
    sku: string;
    ingredient: string;
    actualConc: number;
    oldLimit: number | null;
  }>(
    `
    MATCH (m:Market {name: $market})<-[:SOLD_IN]-(p:Product)
    MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
    WHERE (i)-[:BELONGS_TO]->(:Category {name: $category})
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS actualConc
    RETURN p.name AS product, p.sku AS sku, i.name AS ingredient, actualConc,
           CASE $market
             WHEN 'EU'    THEN i.maxConcentrationEU
             WHEN 'US'    THEN i.maxConcentrationUS
             WHEN 'China' THEN i.maxConcentrationChina
             WHEN 'Japan' THEN i.maxConcentrationJapan
             ELSE null
           END AS oldLimit
    ORDER BY actualConc DESC
  `,
    { market, category: ingredientClass }
  );

  return rows.map((r) => {
    const actualPct = r.actualConc * 100;
    const oldLimitPct = r.oldLimit ? r.oldLimit * 100 : null;
    const newLimitPct = newLimitFraction * 100;

    let status: RegulatoryImpact["status"];
    if (r.actualConc > newLimitFraction) {
      if (oldLimitPct !== null && r.actualConc > r.oldLimit!) {
        status = "already_violated";
      } else {
        status = "newly_violated";
      }
    } else {
      status = "safe";
    }

    return {
      product: r.product,
      sku: r.sku,
      ingredient: r.ingredient,
      actualPct,
      oldLimitPct: oldLimitPct ?? 0,
      newLimitPct,
      status,
    };
  });
  });
}

// Also run n20s validation with the new limit to show RDFS catches subclasses
export async function runRegulatoryChangeN20s(
  market: string,
  newLimitFraction: number
): Promise<{ ingredient: string; actual: number; limit: number; inferredClass: string }[]> {
  const g = uniqueGraphName("reg_impact");
  await n20sDropSafe(g);

  const ontTurtles = await fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`);
  await n20sProjectTemplateAll(g);
  await n20sAddTurtleBulk(g, ontTurtles);

  const marketProp = `maxConcentration${market}`;
  const rows = await n20sQuery(g, `
    PREFIX cosmo: <http://example.org/cosmo#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?label ?limit ?className WHERE {
      ?ing cosmo:${marketProp} ?limit .
      ?ing rdfs:label ?label .
      ?ing rdf:type ?class .
      FILTER(STRSTARTS(STR(?class), "http://example.org/cosmo#"))
      BIND(REPLACE(STR(?class), "http://example.org/cosmo#", "") AS ?className)
    }
  `, "RDFS");

  await n20sDropSafe(g);

  return rows.map((r) => ({
    ingredient: String(r.label),
    actual: Number(r.limit),
    limit: newLimitFraction,
    inferredClass: String(r.className),
  }));
}

// ═══════════════════════════════════════════════════════════════
// Scenario 2: PhotosensitiveAgent in Non-SPF Products
//
// RDFS infers which ingredients are PhotosensitiveAgent
// Cypher traverses non-sunscreen products → BOM → ingredients
// Rule fires if photosensitive ingredient > threshold in non-SPF
// ═══════════════════════════════════════════════════════════════

export interface PhotosensitiveHit {
  product: string;
  productType: string;
  ingredient: string;
  concentrationPct: number;
  inferredClasses: string[];
}

export async function runPhotosensitiveCheck(
  thresholdFraction: number
): Promise<PhotosensitiveHit[]> {
  return withGroup(`Photosensitive Agent Scan (>${(thresholdFraction*100).toFixed(2)}%)`, async () => {
  const graphName = uniqueGraphName("photo");
  await n20sDropSafe(graphName);

  // Step 1: Cypher traversal — non-sunscreen products → BOM → ingredients
  const bomData = await runQuery<{
    product: string;
    productType: string;
    ingredient: string;
    concentrationPct: number;
  }>(`
    MATCH (p:Product)
    WHERE p.type <> 'Sunscreen'
    MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
    WHERE finalConc > $threshold
    RETURN p.name AS product, p.type AS productType,
           i.name AS ingredient, round(finalConc * 100, 4) AS concentrationPct
    ORDER BY finalConc DESC
  `, { threshold: thresholdFraction });

  // Step 2: Project unique ingredient turtles + ontology into n20s
  const uniqueNames = [...new Set(bomData.map((r) => r.ingredient))];
  const ontTurtles = await fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`);
  await n20sProjectTemplate(graphName, uniqueNames);
  await n20sAddTurtleBulk(graphName, ontTurtles);

  // Step 3: RDFS query — which ingredients are PhotosensitiveAgent?
  const photoAgents = await n20sQuery(graphName, `
    PREFIX cosmo: <http://example.org/cosmo#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?label ?className WHERE {
      ?ing rdf:type cosmo:PhotosensitiveAgent .
      ?ing rdfs:label ?label .
      ?ing rdf:type ?class .
      FILTER(STRSTARTS(STR(?class), "http://example.org/cosmo#"))
      BIND(REPLACE(STR(?class), "http://example.org/cosmo#", "") AS ?className)
    }
  `, "RDFS");

  await n20sDropSafe(graphName);

  // Cross-reference: which BOM entries involve PhotosensitiveAgents?
  const photoNames = new Set(photoAgents.map((r) => String(r.label)));
  const classesByName: Record<string, string[]> = {};
  photoAgents.forEach((r) => {
    const label = String(r.label);
    const cls = String(r.className);
    if (!classesByName[label]) classesByName[label] = [];
    if (!classesByName[label].includes(cls)) classesByName[label].push(cls);
  });

  return bomData
    .filter((r) => photoNames.has(r.ingredient))
    .map((r) => ({
      product: r.product,
      productType: r.productType,
      ingredient: r.ingredient,
      concentrationPct: r.concentrationPct,
      inferredClasses: classesByName[r.ingredient] || [],
    }));
  });
}

// ═══════════════════════════════════════════════════════════════
// Scenario 3: Supplier Disruption Cascade
//
// Supplier blocked → traverse ingredients → traverse products →
// find substitutes → validate substituted formulations
// ═══════════════════════════════════════════════════════════════

export interface SupplierImpact {
  ingredient: string;
  category: string;
  affectedProducts: string[];
  substitutes: { name: string; category: string }[];
}

export interface SubstitutionValidation {
  product: string;
  original: string;
  substitute: string;
  originalProductCost: number;
  substitutedProductCost: number;
  violations: { ingredient: string; market: string; actual: number; limit: number }[];
  status: "pass" | "fail";
}

export async function runSupplierDisruption(
  supplierName: string
): Promise<{
  supplier: { name: string; country: string };
  impacts: SupplierImpact[];
}> {
  return withGroup(`Supplier Disruption: ${supplierName}`, async () => {
  // Step 1: Find supplier and all affected ingredients
  const supplierInfo = await runQuery<{ name: string; country: string }>(`
    MATCH (s:Supplier {name: $name})
    RETURN s.name AS name, s.country AS country
  `, { name: supplierName });

  if (supplierInfo.length === 0) {
    return { supplier: { name: supplierName, country: "Unknown" }, impacts: [] };
  }

  // Step 2: Deep traversal — Supplier ← SUPPLIED_BY ← Ingredient → CONTAINS* ← Product
  const impacts = await runQuery<{
    ingredient: string;
    category: string;
    products: string[];
  }>(`
    MATCH (s:Supplier {name: $name})<-[:SUPPLIED_BY]-(i:Ingredient)
    MATCH (i)-[:BELONGS_TO]->(c:Category)
    OPTIONAL MATCH (i)<-[:CONTAINS*]-(p:Product)
    WITH i.name AS ingredient, c.name AS category,
         collect(DISTINCT p.name) AS products
    RETURN ingredient, category, products
    ORDER BY size(products) DESC
  `, { name: supplierName });

  // Step 3: Find substitutes for each affected ingredient
  const impactsWithSubs: SupplierImpact[] = [];
  for (const imp of impacts) {
    const subs = await runQuery<{ name: string; category: string }>(`
      MATCH (i:Ingredient {name: $name})
      MATCH (sub:Ingredient)-[:SUBSTITUTE_FOR]->(i)
      MATCH (sub)-[:BELONGS_TO]->(c:Category)
      RETURN sub.name AS name, c.name AS category
    `, { name: imp.ingredient }).catch(() => []);

    impactsWithSubs.push({
      ingredient: imp.ingredient,
      category: imp.category,
      affectedProducts: imp.products.filter(Boolean),
      substitutes: subs,
    });
  }

  return { supplier: supplierInfo[0], impacts: impactsWithSubs };
  });
}

export async function validateSubstitution(
  productSku: string,
  originalIngredient: string,
  substituteIngredient: string
): Promise<SubstitutionValidation> {
  return withGroup(`Validate Swap: ${originalIngredient} → ${substituteIngredient}`, async () => {
  const g = uniqueGraphName("sub_val");
  await n20sDropSafe(g);

  // Get BOM with the substitution applied (no turtle needed)
  const bom = await runQuery<{ ingredient: string; conc: number }>(`
    MATCH path = (p:Product {sku: $sku})-[:CONTAINS*]->(i:Ingredient)
    WITH i.name AS origName,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS conc
    RETURN CASE origName WHEN $original THEN $substitute ELSE origName END AS ingredient,
           conc
  `, { sku: productSku, original: originalIngredient, substitute: substituteIngredient });

  const ingredientNames = [...new Set(bom.map((r) => r.ingredient))];
  const concLines = bom.map((r) => {
    const sn = safeName(r.ingredient);
    return `cosmo:${sn} cosmo:actualConcentration "${r.conc}"^^xsd:double .`;
  }).join("\n");
  const concTurtle = `@prefix cosmo: <http://example.org/cosmo#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${concLines}`;
  const ontTurtles = await fetchTurtles(`MATCH (o:Ontology {name: 'cosmo'}) RETURN o.turtle AS turtle`);
  await n20sProjectTemplate(g, ingredientNames);
  await n20sAddTurtleBulk(g, [concTurtle, ...ontTurtles]);

  // Run multi-market rules with RDFS
  const ruleRows = await n20sQueryWithRules(g, MARKET_SPARQL, MARKET_RULES, "RDFS");
  const violations = ruleRows.map((v) => ({
    ingredient: String(v.label), market: String(v.market),
    actual: Number(v.actual), limit: Number(v.limit),
  }));

  await n20sDropSafe(g);

  // Compute full product cost: original vs substituted
  // sum(concentration × cost_per_kg) for all ingredients
  const costs = await runQuery<{
    name: string;
    originalProductCost: number;
    substitutedProductCost: number;
  }>(`
    MATCH (p:Product {sku: $sku})
    MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
    WITH p,
         i.name AS ingName,
         i.cost AS ingCost,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS conc
    OPTIONAL MATCH (sub:Ingredient {name: $substitute})
    WITH p.name AS name,
         sum(conc * ingCost) AS originalProductCost,
         sum(conc * CASE WHEN ingName = $original THEN sub.cost ELSE ingCost END) AS substitutedProductCost
    RETURN name, originalProductCost, substitutedProductCost
  `, { sku: productSku, original: originalIngredient, substitute: substituteIngredient });

  return {
    product: costs[0]?.name || productSku,
    original: originalIngredient,
    substitute: substituteIngredient,
    originalProductCost: costs[0]?.originalProductCost || 0,
    substitutedProductCost: costs[0]?.substitutedProductCost || 0,
    violations: violations.map((v) => ({ ingredient: v.label, market: v.market, actual: Number(v.actual), limit: Number(v.limit) })),
    status: violations.length === 0 ? "pass" : "fail",
  };
  });
}

// ═══════════════════════════════════════════════════════════════
// Scenario 4: Allergen Propagation
//
// An ingredient is reclassified as Allergen in the ontology →
// RDFS propagates → find all products containing it →
// SHACL validates: allergens must declare EU concentration limits
// ═══════════════════════════════════════════════════════════════

export interface AllergenPropagation {
  ingredient: string;
  currentClasses: string[];
  affectedProducts: { name: string; concentrationPct: number; markets: string[] }[];
  shaclViolations: { focusNode: string; message: string }[];
}

export async function runAllergenPropagation(
  ingredientName: string
): Promise<AllergenPropagation> {
  return withGroup(`Allergen Reclassification: ${ingredientName}`, async () => {
  const g = uniqueGraphName("allergen");
  await n20sDropSafe(g);

  // Step 1: Cypher traversal — find all products containing this ingredient
  const products = await runQuery<{
    name: string;
    concentrationPct: number;
    markets: string[];
  }>(`
    MATCH path = (p:Product)-[:CONTAINS*]->(i:Ingredient {name: $name})
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
    OPTIONAL MATCH (p)-[:SOLD_IN]->(m:Market)
    WITH p.name AS name, round(finalConc * 100, 4) AS concentrationPct,
         collect(DISTINCT m.name) AS markets
    RETURN name, concentrationPct, markets
    ORDER BY concentrationPct DESC
  `, { name: ingredientName });

  // Step 2: Project ingredient via template + inject Allergen reclassification
  const sn = safeName(ingredientName);
  const allergenTriple = `@prefix cosmo: <http://example.org/cosmo#> .\ncosmo:${sn} a cosmo:Allergen .`;
  await n20sProjectTemplate(g, [ingredientName]);
  await n20sAddTurtle(g, allergenTriple);

  // Step 3: Get classification (no RDFS needed — types are explicit)
  const classRows = await n20sQuery(g, `
    PREFIX cosmo: <http://example.org/cosmo#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?className WHERE {
      cosmo:${sn} rdf:type ?class .
      FILTER(STRSTARTS(STR(?class), "http://example.org/cosmo#"))
      BIND(REPLACE(STR(?class), "http://example.org/cosmo#", "") AS ?className)
    }
  `);
  const classes = classRows.map((r) => ({ className: String(r.className) }));

  // Step 4: Minimal SHACL — allergens must declare EU limits
  const allergenShacl = [
    '@prefix sh: <http://www.w3.org/ns/shacl#> .',
    '@prefix cosmo: <http://example.org/cosmo#> .',
    'cosmo:AllergenLabelingShape a sh:NodeShape ;',
    '    sh:targetClass cosmo:Allergen ;',
    '    sh:property [',
    '        sh:path cosmo:maxConcentrationEU ;',
    '        sh:minCount 1 ;',
    '        sh:message "EU regulation: Allergens must declare maxConcentrationEU for labeling compliance" ;',
    '    ] .',
  ].join('\n');
  await n20sAddTurtle(g, allergenShacl);

  const shaclResults = await n20sValidate(g);

  await n20sDropSafe(g);

  return {
    ingredient: ingredientName,
    currentClasses: classes.map((c) => c.className),
    affectedProducts: products,
    shaclViolations: shaclResults
      .filter((s) => s.focusNode != null)
      .map((s) => ({
        focusNode: String(s.focusNode).replace("http://example.org/cosmo#", "cosmo:"),
        message: String(s.message),
      })),
  };
  });
}

// Helper: list suppliers for the dropdown
export async function getSuppliers(): Promise<{ name: string; country: string; ingredientCount: number }[]> {
  return runQuery(`
    MATCH (s:Supplier)<-[:SUPPLIED_BY]-(i:Ingredient)
    RETURN s.name AS name, s.country AS country, count(i) AS ingredientCount
    ORDER BY ingredientCount DESC
  `);
}
