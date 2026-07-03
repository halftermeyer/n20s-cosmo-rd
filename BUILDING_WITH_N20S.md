# Building Neo4j Apps with n20s — Demo-Specific Patterns

Patterns and lessons specific to this cosmetics R&D demo. For general n20s best practices (graph lifecycle, data modelling, datatypes, rules, SHACL, agent integration, deployment), see the canonical guide in the plugin repo:

**[n20s BEST_PRACTICES.md](https://github.com/halftermeyer/neo4j-n20s/blob/main/BEST_PRACTICES.md)**

This document covers demo-specific implementation details and supplements the canonical guide with concrete code from this project.

---

## Core Principle: Scope First, Reason Second

n20s follows the same mental model as GDS graph projections:

1. **Cypher traverses** the property graph to select relevant data
2. **n20s projects** that data into an ephemeral in-memory RDF graph
3. **n20s reasons** over the projection (RDFS, rules, SHACL)
4. **n20s drops** the graph — no persistent state

The property graph determines **WHAT** gets reasoned about. The RDF layer determines **HOW** it gets reasoned about.

## Data Modelling

### RDF as Cargo, Not Structure

Store RDF knowledge as `turtle` string properties on LPG nodes. The graph structure stays clean — relationships, labels, and properties are pure LPG. The RDF lives inside the node as cargo:

```cypher
CREATE (:Ingredient {
  name: 'Retinol',
  inci: 'RETINOL',
  cost: 120.0,
  turtle: '
    @prefix cosmo: <http://example.org/cosmo#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    cosmo:Retinol a cosmo:RetinoidAgent, cosmo:PhotosensitiveAgent ;
        rdfs:label "Retinol" ;
        cosmo:maxConcentrationEU "0.05"^^xsd:double .
  '
})
```

### Shared Knowledge on Dedicated Nodes

Ontologies and SHACL shapes go on their own nodes — loaded alongside ingredient data when reasoning:

```cypher
CREATE (:Ontology {name: 'cosmo', turtle: '...'})
CREATE (:SHACLRules {name: 'cosmo_validation', turtle: '...'})
```

### Turtle String Best Practices

- **Each turtle string must be self-contained** — include `@prefix` declarations in every turtle property. This makes them composable: you can load any subset without missing prefixes.
- **Use `xsd:double` for numeric values** that will be compared with `greaterThan` builtins — not `xsd:decimal` (which rejects scientific notation like `8.03E-4` from Cypher's `toString()`).
- **Use real newlines**, not `\n` escapes, in turtle strings stored as Cypher properties. Cypher interprets `\n` inside single-quoted strings as real newlines.
- **Include `rdfs:label`** on every RDF resource — rules and SPARQL queries frequently need human-readable names.

### Safe Name Generation

When building RDF URIs from LPG property values, strip non-alphanumeric characters:

```typescript
const safeName = ingredientName.replace(/[^a-zA-Z0-9]/g, "");
// "Hyaluronic Acid" → "HyaluronicAcid"
// → cosmo:HyaluronicAcid in turtle
```

The same function must be used everywhere: data generation, turtle properties, SPARQL queries, and Cypher-built turtle snippets.

## Plugin Mode vs Server Mode

### Plugin Mode (default)

n20s procedures run inside Neo4j's JVM. All reasoning happens in Cypher:

```cypher
// Load turtle cargo into an in-memory graph
MATCH (i:Ingredient {name: 'Retinol'})
CALL n20s.graph.addTurtle('check', i.turtle)
YIELD added RETURN added;

// Query with RDFS backward chaining
CALL n20s.graph.query('check', '
  PREFIX cosmo: <http://example.org/cosmo#>
  SELECT ?class WHERE { cosmo:Retinol a ?class }
', 'RDFS') YIELD row
RETURN row;
```

### Server Mode

n20s-server runs as a standalone HTTP service. Same Jena engine, different deployment:

```bash
CORS=true PORT=7475 java -jar n20s-server.jar
```

Call the REST API directly or through `apoc.load.jsonParams`:

```bash
curl -X POST http://localhost:7475/graph/check/turtle \
  -H 'Content-Type: application/json' \
  -d '{"turtle": "@prefix ex: <http://ex.org/> . ex:A a ex:B ."}'
```

### Abstraction Layer Pattern

Build an abstraction that generates the right calls for each mode. This is the pattern used in this demo (`app/src/lib/n20s.ts`):

```typescript
export async function n20sAddTurtle(graphName: string, turtle: string): Promise<number> {
  if (mode === "server") {
    // HTTP POST to n20s-server
    const result = await fetch(`${serverUrl}/graph/${graphName}/turtle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turtle }),
    }).then(r => r.json());
    return result.added;
  }
  // Plugin: Cypher procedure call
  const rows = await runQuery(`
    CALL n20s.graph.addTurtle($g, $turtle) YIELD added RETURN added
  `, { g: graphName, turtle });
  return rows[0]?.added || 0;
}
```

### When to Use Which

| Scenario | Mode | Why |
|---|---|---|
| Self-managed Neo4j | Plugin | Direct Cypher integration, no extra service |
| Aura / managed Neo4j | Server | Can't install plugins |
| Browser-based app | Either | Plugin via neo4j-driver, server via fetch (add CORS) |
| Multiple apps sharing reasoning | Server | Centralized reasoning service |

## Loading Data: Patterns That Work

### Bulk Loading with Aggregating Function (v1.1.0+)

Load multiple turtle strings in a single Cypher round trip:

```cypher
MATCH (i:Ingredient) WHERE i.turtle IS NOT NULL
WITH n20s.graph.addTurtle('analysis', i.turtle) AS g
RETURN g.tripleCount, g.added;
```

### Scoped Loading via Cypher Traversal

Use Cypher to traverse the graph first, then load only the relevant turtles:

```cypher
// Walk the BOM tree, load only ingredients in THIS product
MATCH (p:Product {sku: 'SKU-0001'})-[:CONTAINS*]->(i:Ingredient)
WITH collect(DISTINCT i.turtle) AS turtles
// Load scoped set into n20s
UNWIND turtles AS t
CALL n20s.graph.addTurtle('product_check', t) YIELD added
RETURN sum(added);
```

### Injecting Computed Values as Turtle

When Cypher computes values (like BOM concentrations), inject them as typed RDF triples:

```typescript
const concLines = ingredients.map(i => {
  const safe = i.name.replace(/[^a-zA-Z0-9]/g, "");
  return `cosmo:${safe} cosmo:actualConcentration "${i.concentration}"^^xsd:double .`;
}).join("\n");

const turtle = `@prefix cosmo: <http://example.org/cosmo#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
${concLines}`;

await n20sAddTurtle('validation', turtle);
```

### Server Mode: Batch Loading

Send an array of turtle strings in one POST:

```typescript
await fetch(`${serverUrl}/graph/${name}/turtle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ turtles: arrayOfTurtleStrings }),
});
```

## Reasoning Patterns

### RDFS Classification

Use backward chaining to infer class membership without materializing all triples:

```cypher
CALL n20s.graph.query('g', '
  PREFIX cosmo: <http://example.org/cosmo#>
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  SELECT ?label WHERE {
    ?ing rdf:type cosmo:PhotosensitiveAgent .
    ?ing rdfs:label ?label .
  }
', 'RDFS') YIELD row
RETURN row.label;
```

This finds Retinol even though it's declared as `RetinoidAgent` — because the ontology says `RetinoidAgent rdfs:subClassOf PhotosensitiveAgent`.

### Custom Rules with Builtins

Layer Jena rules on top of RDFS for domain-specific logic:

```cypher
CALL n20s.graph.queryWithRules('g', '
  PREFIX cosmo: <http://example.org/cosmo#>
  SELECT ?label ?actual ?limit WHERE {
    ?ing cosmo:violatesEU ?label .
    ?ing cosmo:actualConcentration ?actual .
    ?ing cosmo:maxConcentrationEU ?limit .
  }
', '
[eu_check:
  (?ing http://example.org/cosmo#actualConcentration ?actual)
  (?ing http://example.org/cosmo#maxConcentrationEU ?limit)
  greaterThan(?actual, ?limit)
  (?ing http://www.w3.org/2000/01/rdf-schema#label ?name)
  ->
  (?ing http://example.org/cosmo#violatesEU ?name)]
', 'RDFS') YIELD row
RETURN row;
```

**Key points:**
- Rules use full IRIs, not prefixes
- `greaterThan` compares `xsd:double` values — both sides must be typed
- RDFS runs first, rules fire on the enriched model
- Available builtins: `greaterThan`, `lessThan`, `equal`, `notEqual`, `regex`, `sum`, `product`

### SHACL Validation

Load shapes alongside data, then validate:

```cypher
// Load data + ontology + SHACL shapes into same graph
CALL n20s.graph.addTurtle('check', $ingredientTurtle) YIELD added;
CALL n20s.graph.addTurtle('check', $ontologyTurtle) YIELD added;
CALL n20s.graph.addTurtle('check', $shaclTurtle) YIELD added;

// Validate
CALL n20s.graph.validate('check')
YIELD focusNode, severity, message
RETURN focusNode, severity, message;
```

**SHACL tips:**
- SPARQL constraints inside `sh:select` must be **single-line** with inline `PREFIX` declarations
- Avoid expensive SPARQL-based SHACL shapes with RDFS inference — they can be very slow on large graphs
- Use focused shapes (target specific classes) rather than broad `sh:targetClass cosmo:CosmeticIngredient`
- `null` focusNode in results means validation passed — filter it out

### Forward Chaining + Export

Materialize all inferences, then export for audit:

```cypher
CALL n20s.graph.infer('g', 'RDFS')
YIELD triplesBefore, triplesAfter, newTriples
RETURN triplesBefore, triplesAfter, newTriples;

CALL n20s.graph.toTurtle('g')
YIELD turtle
RETURN turtle;
```

## Graph Lifecycle: Always Drop

In-memory graphs consume heap. Always drop after use:

```typescript
try {
  await n20sAddTurtle(g, turtle);
  const results = await n20sQuery(g, sparql, 'RDFS');
  return results;
} finally {
  await n20sDropSafe(g);  // never leak graphs
}
```

Use unique graph names per operation to avoid conflicts between concurrent users.

## Gotchas and Lessons Learned

### `project()` replaces, `addTurtle()` appends

By default, calling `n20s.graph.project()` on an existing graph **replaces** it. Calling `n20s.graph.addTurtle()` **appends** to it. In v1.1.0+, both accept an `ifExists` parameter (`'append'`, `'replace'`, `'fail'`) to make this explicit.

**Practical impact:** If you project concentration triples first, then addTurtle ingredient data, it works. If you addTurtle first, then project, the project replaces everything. Order matters.

### Typed Literals for Numeric Comparison

Rules with `greaterThan` require both values to be the same XSD type. Use `xsd:double` consistently:

```turtle
# In ingredient turtle:
cosmo:Retinol cosmo:maxConcentrationEU "0.05"^^xsd:double .

# In computed concentration turtle:
cosmo:Retinol cosmo:actualConcentration "0.10"^^xsd:double .
```

Do **not** use `xsd:decimal` — Cypher's `toString()` can produce scientific notation (`8.03E-4`) which is invalid for `xsd:decimal`.

### BOM Concentration Computation

When computing concentrations through a multi-level BOM, keep the `path` variable limited to `CONTAINS` relationships only:

```cypher
// CORRECT: path covers only CONTAINS hops
MATCH path = (p:Product)-[:CONTAINS*]->(i:Ingredient)
WHERE (i)-[:BELONGS_TO]->(:Category {name: $category})
WITH i, reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS conc

// WRONG: path includes BELONGS_TO — r.ratio is null on that hop
MATCH path = (p:Product)-[:CONTAINS*]->(i:Ingredient)-[:BELONGS_TO]->(:Category)
WITH i, reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS conc
```

### SHACL + RDFS = Slow

Loading the full ontology (200+ triples) with SHACL shapes that contain SPARQL constraints and running with RDFS inference can be extremely slow. For targeted validations (e.g., "does this allergen have the required EU limit?"), use a minimal inline SHACL shape instead of the full shape set:

```typescript
const allergenShacl = `
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix cosmo: <http://example.org/cosmo#> .
  cosmo:AllergenLabelingShape a sh:NodeShape ;
      sh:targetClass cosmo:Allergen ;
      sh:property [
          sh:path cosmo:maxConcentrationEU ;
          sh:minCount 1 ;
          sh:message "Allergens must declare EU concentration limits" ;
      ] .
`;
```

### Audit Trail

Log every n20s call (whether Cypher procedure or HTTP) to an audit log. This makes the app debuggable and demo-friendly. The pattern from this project:

```typescript
// neo4j.ts: every runQuery() call is logged with timing, params, results
// n20s.ts: every server HTTP call is logged via pushLogEntry()
// QueryAuditDrawer: collapsible sidebar showing all calls grouped by operation
```

## App Architecture Summary

```
Browser
├── React UI (Needle design system)
│   ├── Explore tab — ingredient portfolio, RDFS classification
│   ├── Formulate tab — slot picker, sliders, inline validation
│   ├── Scenarios tab — 4 interactive what-if scenarios
│   └── Assistant tab — Gemini chatbot with tool calling
│
├── lib/neo4j.ts — Neo4j driver, query logging, groups
├── lib/n20s.ts — n20s abstraction (plugin ↔ server)
├── lib/queries.ts — Cypher + n20s query functions
└── lib/scenarioQueries.ts — scenario-specific queries

Neo4j (bolt)
├── LPG: Ingredients, Products, BOMs, Suppliers, Markets
├── RDF cargo: turtle properties on nodes
└── n20s plugin (or standalone n20s-server via HTTP)
```

## Reference

- [n20s repository](https://github.com/halftermeyer/neo4j-n20s) — plugin + server source, CONTEXT.md
- [n20s CONTEXT.md](https://github.com/halftermeyer/neo4j-n20s/blob/main/CONTEXT.md) — full API reference, philosophy, patterns
- [This demo](https://github.com/halftermeyer/n20s-cosmo-rd) — working example of everything described above
