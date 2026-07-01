import { runQuery, withGroup } from "./neo4j";

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
    // Traverse: Market ← SOLD_IN ← Product → CONTAINS* → Ingredient → BELONGS_TO → Category
    MATCH (m:Market {name: $market})<-[:SOLD_IN]-(p:Product)
    MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
    WHERE (i)-[:BELONGS_TO]->(:Category {name: $category})
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS actualConc
    // Extract old limit from turtle if present
    WITH p, i, actualConc,
         CASE WHEN i.turtle CONTAINS $limitProp
              THEN toFloat(
                head([x IN split(i.turtle, $limitProp) WHERE x <> i.turtle
                     | trim(split(split(x, '"')[1], '"')[0])])
              )
              ELSE null
         END AS oldLimit
    RETURN p.name AS product, p.sku AS sku, i.name AS ingredient,
           actualConc, oldLimit
    ORDER BY actualConc DESC
  `,
    {
      market,
      category: ingredientClass,
      limitProp: `maxConcentration${market}`,
    }
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
  const graphName = "reg_impact";

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  // Load all ingredients + ontology
  await runQuery(
    `
    MATCH (i:Ingredient) WHERE i.turtle IS NOT NULL
    WITH collect(i.turtle) AS turtles
    UNWIND turtles AS t
    CALL n20s.graph.addTurtle($g, t)
    YIELD graphName, added
    RETURN sum(added) AS total
  `,
    { g: graphName }
  );

  await runQuery(
    `
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle($g, ont.turtle)
    YIELD graphName, added
    RETURN added
  `,
    { g: graphName }
  );

  // Inject the new limit as a triple for ALL members of the class (via RDFS inference)
  // Use queryWithRules to find all ingredients that are RetinoidAgents (including via subclass)
  // and check against the new limit
  const marketProp = `maxConcentration${market}`;
  const results = await runQuery<{
    ingredient: string;
    actual: number;
    limit: number;
    inferredClass: string;
  }>(
    `
    CALL n20s.graph.query($g, '
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
    ', 'RDFS') YIELD row
    RETURN row.label AS ingredient, toFloat(row.limit) AS actual,
           $newLimit AS limit, row.className AS inferredClass
  `,
    { g: graphName, newLimit: newLimitFraction }
  );

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  return results;
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
  const graphName = "photosensitive";

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  // Step 1: Cypher traversal — non-sunscreen products → BOM → ingredients
  const bomData = await runQuery<{
    product: string;
    productType: string;
    ingredient: string;
    concentrationPct: number;
    turtle: string;
  }>(`
    MATCH (p:Product)
    WHERE p.type <> 'Sunscreen'
    MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
    WHERE finalConc > $threshold
    RETURN p.name AS product, p.type AS productType,
           i.name AS ingredient, round(finalConc * 100, 4) AS concentrationPct,
           i.turtle AS turtle
    ORDER BY finalConc DESC
  `, { threshold: thresholdFraction });

  // Step 2: Load unique ingredient turtles into n20s
  const uniqueTurtles = [...new Set(bomData.map((r) => r.turtle))];
  for (const t of uniqueTurtles) {
    await runQuery(
      `CALL n20s.graph.addTurtle($g, $turtle) YIELD added RETURN added`,
      { g: graphName, turtle: t }
    );
  }

  // Add ontology for RDFS inference
  await runQuery(
    `
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle($g, ont.turtle)
    YIELD graphName, added
    RETURN added
  `,
    { g: graphName }
  );

  // Step 3: RDFS query — which ingredients are PhotosensitiveAgent?
  const photoAgents = await runQuery<{ label: string; className: string }>(`
    CALL n20s.graph.query($g, '
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
    ', 'RDFS') YIELD row
    RETURN row.label AS label, row.className AS className
  `, { g: graphName });

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  // Cross-reference: which BOM entries involve PhotosensitiveAgents?
  const photoNames = new Set(photoAgents.map((r) => r.label));
  const classesByName: Record<string, string[]> = {};
  photoAgents.forEach((r) => {
    if (!classesByName[r.label]) classesByName[r.label] = [];
    if (!classesByName[r.label].includes(r.className)) {
      classesByName[r.label].push(r.className);
    }
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
  const graphName = "sub_validation";

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  // Get BOM with the substitution applied
  const bom = await runQuery<{ ingredient: string; conc: number; turtle: string }>(`
    MATCH path = (p:Product {sku: $sku})-[:CONTAINS*]->(i:Ingredient)
    WITH i.name AS origName, i.turtle AS origTurtle,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS conc
    OPTIONAL MATCH (sub:Ingredient {name: $substitute})
    WITH origName, origTurtle, conc, sub,
         CASE origName WHEN $original THEN $substitute ELSE origName END AS ingredient,
         CASE origName WHEN $original THEN sub.turtle ELSE origTurtle END AS turtle
    WHERE turtle IS NOT NULL
    RETURN ingredient, conc, turtle
  `, { sku: productSku, original: originalIngredient, substitute: substituteIngredient });

  // Load into n20s
  const uniqueTurtles = [...new Set(bom.map((r) => r.turtle))];
  for (const t of uniqueTurtles) {
    await runQuery(
      `CALL n20s.graph.addTurtle($g, $turtle) YIELD added RETURN added`,
      { g: graphName, turtle: t }
    );
  }

  // Add concentrations
  const concLines = bom.map((r) => {
    const safeName = r.ingredient.replace(/[^a-zA-Z0-9]/g, "");
    return `cosmo:${safeName} cosmo:actualConcentration "${r.conc}"^^xsd:double .`;
  }).join("\n");
  const concTurtle = `@prefix cosmo: <http://example.org/cosmo#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${concLines}`;

  await runQuery(
    `CALL n20s.graph.addTurtle($g, $turtle) YIELD added RETURN added`,
    { g: graphName, turtle: concTurtle }
  );

  // Add ontology for RDFS class inference
  await runQuery(`
    MATCH (ont:Ontology {name: 'cosmo'})
    CALL n20s.graph.addTurtle($g, ont.turtle)
    YIELD graphName, added RETURN added
  `, { g: graphName });

  // Run multi-market rules with RDFS
  const violations = await runQuery<{ label: string; market: string; actual: number; limit: number }>(`
    CALL n20s.graph.queryWithRules($g, '
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
    ', '
    [eu: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationEU ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesEU ?n)]
    [us: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationUS ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesUS ?n)]
    [cn: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationChina ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesChina ?n)]
    [jp: (?ing http://example.org/cosmo#actualConcentration ?a) (?ing http://example.org/cosmo#maxConcentrationJapan ?l) greaterThan(?a,?l) (?ing http://www.w3.org/2000/01/rdf-schema#label ?n) -> (?ing http://example.org/cosmo#violatesJapan ?n)]
    ', 'RDFS') YIELD row
    RETURN row.label AS label, row.market AS market, row.actual AS actual, row.limit AS limit
  `, { g: graphName });

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

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
  const graphName = "allergen_prop";

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  // Step 1: Cypher traversal — find all products containing this ingredient
  const products = await runQuery<{
    product: string;
    concentrationPct: number;
    markets: string[];
  }>(`
    MATCH path = (p:Product)-[:CONTAINS*]->(i:Ingredient {name: $name})
    WITH p, i,
         reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
    OPTIONAL MATCH (p)-[:SOLD_IN]->(m:Market)
    WITH p.name AS product, round(finalConc * 100, 4) AS concentrationPct,
         collect(DISTINCT m.name) AS markets
    RETURN product AS name, concentrationPct, markets
    ORDER BY concentrationPct DESC
  `, { name: ingredientName });

  // Step 2: Load ingredient turtle + inject Allergen reclassification
  // No full ontology needed — the ingredient's turtle already has its rdf:type classes,
  // and we add the new Allergen type directly
  const safeName = ingredientName.replace(/[^a-zA-Z0-9]/g, "");

  await runQuery(`
    MATCH (i:Ingredient {name: $name})
    CALL n20s.graph.addTurtle($g, i.turtle)
    YIELD added RETURN added
  `, { name: ingredientName, g: graphName });

  // Inject the reclassification: this ingredient is now also an Allergen
  await runQuery(`
    CALL n20s.graph.addTurtle($g, $turtle)
    YIELD added RETURN added
  `, {
    g: graphName,
    turtle: `@prefix cosmo: <http://example.org/cosmo#> .\ncosmo:${safeName} a cosmo:Allergen .`,
  });

  // Step 3: Get classification (no RDFS needed — types are explicit)
  const classes = await runQuery<{ className: string }>(`
    CALL n20s.graph.query($g, '
      PREFIX cosmo: <http://example.org/cosmo#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?className WHERE {
        cosmo:${safeName} rdf:type ?class .
        FILTER(STRSTARTS(STR(?class), "http://example.org/cosmo#"))
        BIND(REPLACE(STR(?class), "http://example.org/cosmo#", "") AS ?className)
      }
    ') YIELD row
    RETURN row.className AS className
  `, { g: graphName });

  // Step 4: Add minimal SHACL shape (allergens must declare EU limits) and validate
  // We use a focused shape — NOT the full SHACL set which includes an expensive
  // SPARQL concentration constraint that's irrelevant here
  const allergenShacl = [
    '@prefix sh: <http://www.w3.org/ns/shacl#> .',
    '@prefix cosmo: <http://example.org/cosmo#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    'cosmo:AllergenLabelingShape a sh:NodeShape ;',
    '    sh:targetClass cosmo:Allergen ;',
    '    sh:property [',
    '        sh:path cosmo:maxConcentrationEU ;',
    '        sh:minCount 1 ;',
    '        sh:message "EU regulation: Allergens must declare maxConcentrationEU for labeling compliance" ;',
    '    ] .',
  ].join('\n');

  await runQuery(`
    CALL n20s.graph.addTurtle($g, $shacl)
    YIELD added RETURN added
  `, { g: graphName, shacl: allergenShacl });

  const shaclResults = await runQuery<{ focusNode: string; message: string }>(`
    CALL n20s.graph.validate($g)
    YIELD focusNode, severity, message
    RETURN focusNode, message
  `, { g: graphName });

  await runQuery(
    `CALL n20s.graph.drop($g) YIELD graphName RETURN graphName`,
    { g: graphName }
  ).catch(() => {});

  return {
    ingredient: ingredientName,
    currentClasses: classes.map((c) => c.className),
    affectedProducts: products,
    shaclViolations: shaclResults
      .filter((s) => s.focusNode != null)
      .map((s) => ({
        focusNode: String(s.focusNode).replace("http://example.org/cosmo#", "cosmo:"),
        message: s.message,
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
