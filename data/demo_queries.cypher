// ══════════════════════════════════════════════════════════════
// n20s Demo: Cosmetics R&D — Formulation Screening Pipeline
//
// LPG graph: ingredients, products, multi-level BOMs, suppliers
// RDF cargo: real INCI classification + EU/China/Japan regulation limits
// Pipeline: GDS discovery → Cypher combinatorial → n20s validation
// ══════════════════════════════════════════════════════════════


// ── Step 0: Clean n20s in-memory graphs ────────────────────────

CALL n20s.graph.list()
YIELD graphName
WITH graphName AS G
CALL n20s.graph.drop(G)
YIELD graphName
RETURN graphName;


// ══════════════════════════════════════════════════════════════
// PASS 1: Pure Cypher — BOM Analysis & Portfolio Overview
// ══════════════════════════════════════════════════════════════


// ── Demo 1.1: BOM concentration — What's in a product? ────────
//
// Walk the multi-level BOM tree (Product → Phase → PreMix → Ingredient)
// and compute final concentration by multiplying ratios along the path.

MATCH path = (p:Product {sku: 'SKU-0001'})-[:CONTAINS*]->(i:Ingredient)
WITH p, i, reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
RETURN p.name AS product, i.name AS ingredient,
       round(finalConc * 100, 4) AS pct
ORDER BY pct DESC;


// ── Demo 1.2: Portfolio overview — Products by type ───────────

MATCH (p:Product)-[:PRODUCED_BY]->(b:Brand)
OPTIONAL MATCH (p)-[:IN_LINE]->(pl:ProductLine)
RETURN b.name AS brand, pl.name AS line, p.type AS type,
       collect(p.name) AS products, count(p) AS count
ORDER BY brand, line;


// ── Demo 1.3: Ingredient frequency across products ───────────

MATCH (p:Product)-[:CONTAINS*]->(i:Ingredient)
WITH i.name AS ingredient, count(DISTINCT p) AS productCount
RETURN ingredient, productCount
ORDER BY productCount DESC
LIMIT 20;


// ── Demo 1.4: Regulated ingredients — what limits apply? ──────
//
// Find all ingredients with EU regulation limits by querying the
// turtle RDF cargo for maxConcentrationEU triples.

MATCH (i:Ingredient)
WHERE i.turtle CONTAINS 'maxConcentrationEU'
MATCH path = (p:Product)-[:CONTAINS*]->(i)
WITH p, i,
     reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
RETURN p.name AS product, i.name AS ingredient,
       round(finalConc * 100, 4) AS actualPct
ORDER BY actualPct DESC
LIMIT 20;


// ══════════════════════════════════════════════════════════════
// PASS 2: GDS Discovery — Co-occurrence, Communities, Similarity
// ══════════════════════════════════════════════════════════════


// ── Demo 2.1: Build ingredient co-occurrence relationships ─────
//
// Two ingredients co-occur if they appear in the same product.

MATCH (i1:Ingredient)<-[:CONTAINS*]-(p:Product)-[:CONTAINS*]->(i2:Ingredient)
WHERE elementId(i1) < elementId(i2)
WITH i1, i2, count(DISTINCT p) AS coCount
MERGE (i1)-[r:CO_OCCURS]-(i2)
SET r.weight = coCount
RETURN count(r) AS coOccurrenceRelationships;


// ── Demo 2.2: Project co-occurrence graph into GDS ──────────────

CALL gds.graph.project(
  'ingredient-cooccurrence',
  'Ingredient',
  {CO_OCCURS: {properties: 'weight', orientation: 'UNDIRECTED'}}
) YIELD graphName, nodeCount, relationshipCount
RETURN graphName, nodeCount, relationshipCount;


// ── Demo 2.3: Louvain community detection ──────────────────────
//
// Find clusters of ingredients that tend to be used together.

CALL gds.louvain.stream('ingredient-cooccurrence', {
  relationshipWeightProperty: 'weight'
}) YIELD nodeId, communityId
WITH gds.util.asNode(nodeId).name AS ingredient, communityId
RETURN communityId, collect(ingredient) AS members, count(*) AS size
ORDER BY size DESC
LIMIT 10;


// ── Demo 2.4: PageRank — most versatile ingredients ────────────

CALL gds.pageRank.stream('ingredient-cooccurrence', {
  relationshipWeightProperty: 'weight'
}) YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS node, score
RETURN node.name AS ingredient, round(score, 4) AS versatilityScore
ORDER BY versatilityScore DESC
LIMIT 15;


// ── Demo 2.5: Node similarity — closest product to a target ────
//
// Project products sharing ingredients into GDS and find most similar.

CALL gds.graph.drop('ingredient-cooccurrence', false)
YIELD graphName RETURN graphName;

MATCH (p:Product)-[:CONTAINS*]->(i:Ingredient)
WITH gds.graph.project('product-ingredients', p, i) AS g
RETURN g.graphName AS graphName, g.nodeCount AS nodeCount, g.relationshipCount AS relationshipCount;

CALL gds.nodeSimilarity.stream('product-ingredients', {
  topK: 5
}) YIELD node1, node2, similarity
WITH gds.util.asNode(node1) AS p1, gds.util.asNode(node2) AS p2, similarity
WHERE p1:Product AND p2:Product
RETURN p1.name AS product1, p2.name AS product2,
       round(similarity, 4) AS jaccardSimilarity
ORDER BY jaccardSimilarity DESC
LIMIT 10;

CALL gds.graph.drop('product-ingredients', false)
YIELD graphName RETURN graphName;


// ══════════════════════════════════════════════════════════════
// PASS 3: Combinatorial Candidate Generation
// ══════════════════════════════════════════════════════════════


// ── Demo 3.1: Generate anti-aging serum candidates ─────────────
//
// Cross-join functional slots, filter incompatibilities.
// Template: Humectant + Emollient + RetinoidAgent + Antioxidant + Preservative

MATCH (h:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Humectant'})
WHERE h.name <> 'Water'
MATCH (e:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Emollient'})
MATCH (r:Ingredient)-[:BELONGS_TO]->(:Category {name: 'RetinoidAgent'})
MATCH (a:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Antioxidant'})
MATCH (p:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Preservative'})
WHERE NOT (r)-[:INCOMPATIBLE_WITH]-(a)
  AND NOT (r)-[:INCOMPATIBLE_WITH]-(h)
  AND NOT (a)-[:INCOMPATIBLE_WITH]-(h)
WITH h, e, r, a, p,
     // Assign realistic concentrations
     0.04 AS humectantRatio,
     0.15 AS emollientRatio,
     0.005 AS retinoidRatio,
     0.02 AS antioxidantRatio,
     0.008 AS preservativeRatio
WITH h, e, r, a, p,
     humectantRatio, emollientRatio, retinoidRatio, antioxidantRatio, preservativeRatio,
     (1.0 - humectantRatio - emollientRatio - retinoidRatio - antioxidantRatio - preservativeRatio) AS waterRatio
RETURN h.name AS humectant, e.name AS emollient,
       r.name AS retinoid, a.name AS antioxidant, p.name AS preservative,
       round(waterRatio * 100, 2) AS waterPct,
       round(retinoidRatio * 100, 3) AS retinoidPct,
       round(antioxidantRatio * 100, 2) AS antioxidantPct
ORDER BY rand()
LIMIT 10;


// ══════════════════════════════════════════════════════════════
// PASS 4: n20s Semantic Validation
// ══════════════════════════════════════════════════════════════


// ── Demo 4.1: RDFS inference — classify ingredients ────────────
//
// Load a candidate formulation's ingredient turtles + ontology
// into n20s and query with RDFS backward chaining.

// 4.1a. Project all ingredient turtles + ontology
MATCH (i:Ingredient) WHERE i.turtle IS NOT NULL
WITH collect(i.turtle) AS ingredientTurtles
UNWIND ingredientTurtles AS t
CALL n20s.graph.addTurtle('cosmo_explore', t)
YIELD graphName, added
RETURN graphName, sum(added) AS totalTriples;

MATCH (ont:Ontology {name: 'cosmo'})
CALL n20s.graph.addTurtle('cosmo_explore', ont.turtle)
YIELD graphName, added
RETURN graphName, added AS ontologyTriples;

// 4.1b. RDFS: Find all photosensitive ingredients
CALL n20s.graph.query('cosmo_explore', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
  PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

  SELECT ?ingredient ?label WHERE {
    ?ingredient rdf:type cosmo:PhotosensitiveAgent .
    ?ingredient rdfs:label ?label .
  }
', 'RDFS') YIELD row
RETURN row;

// 4.1c. RDFS: Find all allergens
CALL n20s.graph.query('cosmo_explore', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
  PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

  SELECT ?ingredient ?label WHERE {
    ?ingredient rdf:type cosmo:Allergen .
    ?ingredient rdfs:label ?label .
  }
', 'RDFS') YIELD row
RETURN row;

// 4.1d. RDFS: Find all ingredients with EU concentration limits
CALL n20s.graph.query('cosmo_explore', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>

  SELECT ?label ?euLimit WHERE {
    ?ing cosmo:maxConcentrationEU ?euLimit .
    ?ing rdfs:label ?label .
  }
  ORDER BY ?label
', 'RDFS') YIELD row
RETURN row;

CALL n20s.graph.drop('cosmo_explore') YIELD graphName RETURN graphName;


// ── Demo 4.2: queryWithRules — concentration limit validation ──
//
// Custom Jena rules with greaterThan builtin layered on RDFS.
// Check if a candidate formulation's actual concentrations
// exceed regulatory limits.

// 4.2a. Load ingredient turtles for a product
MATCH path = (p:Product {sku: 'SKU-0001'})-[:CONTAINS*]->(i:Ingredient)
WHERE i.turtle IS NOT NULL
WITH DISTINCT i
WITH collect(i.turtle) AS turtles
UNWIND turtles AS t
CALL n20s.graph.addTurtle('candidate_check', t)
YIELD graphName, added
RETURN graphName, sum(added) AS ingredientTriples;

// 4.2b. Add actual concentrations as typed xsd:double triples
//       We build a Turtle snippet per ingredient with its BOM concentration
MATCH path = (p:Product {sku: 'SKU-0001'})-[:CONTAINS*]->(i:Ingredient)
WHERE i.turtle IS NOT NULL
WITH i,
     reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
WITH collect(
  'cosmo:' + replace(replace(replace(replace(i.name, ' ', ''), '-', ''), '(', ''), ')', '')
  + ' cosmo:actualConcentration "' + toString(finalConc) + '"^^xsd:double .'
) AS lines
WITH '@prefix cosmo: <http://example.org/cosmo#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n'
     + reduce(s = '', line IN lines | s + line + '\n') AS concTurtle
CALL n20s.graph.addTurtle('candidate_check', concTurtle)
YIELD graphName, added
RETURN graphName, added AS concentrationTriples;

// 4.2c. Add ontology
MATCH (ont:Ontology {name: 'cosmo'})
CALL n20s.graph.addTurtle('candidate_check', ont.turtle)
YIELD graphName, added
RETURN graphName, added AS ontologyTriples;

// 4.2d. queryWithRules: detect EU limit violations
//       Rules use greaterThan builtin to compare actual vs max concentration
CALL n20s.graph.queryWithRules('candidate_check', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

  SELECT ?label ?actual ?limit WHERE {
    ?ing cosmo:violatesEULimit ?label .
    ?ing cosmo:actualConcentration ?actual .
    ?ing cosmo:maxConcentrationEU ?limit .
  }
', '
[eu_limit_check:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationEU ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  ->
  (?ing http://example.org/cosmo#violatesEULimit ?name)]
', 'RDFS') YIELD row
RETURN row;

CALL n20s.graph.drop('candidate_check') YIELD graphName RETURN graphName;


// ── Demo 4.3: SHACL validation per market ──────────────────────
//
// Load ingredient data + SHACL shapes and validate.

// 4.3a. Project regulated ingredients into n20s
MATCH (i:Ingredient)
WHERE i.turtle CONTAINS 'maxConcentration'
WITH collect(i.turtle) AS turtles
UNWIND turtles AS t
CALL n20s.graph.addTurtle('shacl_check', t)
YIELD graphName, added
RETURN graphName, sum(added) AS ingredientTriples;

// Add ontology
MATCH (ont:Ontology {name: 'cosmo'})
CALL n20s.graph.addTurtle('shacl_check', ont.turtle)
YIELD graphName, added
RETURN graphName, added AS ontologyTriples;

// Add SHACL shapes
MATCH (sh:SHACLRules {name: 'cosmo_validation'})
CALL n20s.graph.addTurtle('shacl_check', sh.turtle)
YIELD graphName, added
RETURN graphName, added AS shaclTriples;

// 4.3b. Validate
CALL n20s.graph.validate('shacl_check')
YIELD focusNode, severity, message, path, value
RETURN focusNode, severity, message, path, value;

CALL n20s.graph.drop('shacl_check') YIELD graphName RETURN graphName;


// ── Demo 4.4: Full pipeline — candidate generation + validation ─
//
// Generate a candidate with INTENTIONALLY HIGH concentrations
// to trigger EU limit violations: Retinol at 10% (limit 5%),
// Phenoxyethanol at 2% (limit 1%).

// 4.4a. Load candidate ingredient turtles
MATCH (i:Ingredient)
WHERE i.name IN ['Hyaluronic Acid', 'Squalane', 'Retinol', 'Tocopherol', 'Phenoxyethanol']
WITH collect(i.turtle) AS turtles
UNWIND turtles AS t
CALL n20s.graph.addTurtle('pipeline_candidate', t)
YIELD graphName, added
RETURN graphName, sum(added) AS ingredientTriples;

// 4.4b. Add actual concentrations — deliberately above EU limits
CALL n20s.graph.addTurtle('pipeline_candidate', '
  @prefix cosmo: <http://example.org/cosmo#> .
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
  cosmo:HyaluronicAcid cosmo:actualConcentration "0.04"^^xsd:double .
  cosmo:Squalane cosmo:actualConcentration "0.15"^^xsd:double .
  cosmo:Retinol cosmo:actualConcentration "0.10"^^xsd:double .
  cosmo:Tocopherol cosmo:actualConcentration "0.02"^^xsd:double .
  cosmo:Phenoxyethanol cosmo:actualConcentration "0.02"^^xsd:double .
')
YIELD graphName, added
RETURN graphName, added AS concentrationTriples;

// 4.4c. Add ontology + SHACL shapes
MATCH (ont:Ontology {name: 'cosmo'})
CALL n20s.graph.addTurtle('pipeline_candidate', ont.turtle)
YIELD graphName, added
RETURN graphName, added AS ontologyTriples;

MATCH (sh:SHACLRules {name: 'cosmo_validation'})
CALL n20s.graph.addTurtle('pipeline_candidate', sh.turtle)
YIELD graphName, added
RETURN graphName, added AS shaclTriples;

// 4.4d. Rules check: EU concentration limits
//       greaterThan builtin compares xsd:decimal values
CALL n20s.graph.queryWithRules('pipeline_candidate', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

  SELECT ?label ?actual ?limit WHERE {
    ?ing cosmo:violatesEULimit ?label .
    ?ing cosmo:actualConcentration ?actual .
    ?ing cosmo:maxConcentrationEU ?limit .
  }
', '
[eu_limit_violation:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationEU ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  ->
  (?ing http://example.org/cosmo#violatesEULimit ?name)]
', 'RDFS') YIELD row
RETURN row;

// 4.4e. SHACL validation
CALL n20s.graph.validate('pipeline_candidate')
YIELD focusNode, severity, message, path, value
RETURN focusNode, severity, message, path, value;


// ══════════════════════════════════════════════════════════════
// PASS 5: Export with toTurtle for Audit
// ══════════════════════════════════════════════════════════════


// ── Demo 5.1: Forward-chain RDFS, then export ──────────────────

// Materialize all RDFS inferences
CALL n20s.graph.infer('pipeline_candidate', 'RDFS')
YIELD triplesBefore, triplesAfter, newTriples
RETURN triplesBefore, triplesAfter, newTriples;

// Export the fully-inferred graph as Turtle
CALL n20s.graph.toTurtle('pipeline_candidate')
YIELD turtle
RETURN turtle;

// Final cleanup
CALL n20s.graph.drop('pipeline_candidate') YIELD graphName RETURN graphName;

// Clean up co-occurrence relationships
MATCH ()-[r:CO_OCCURS]-() DELETE r;
