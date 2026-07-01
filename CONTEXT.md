# n20s Cosmetics R&D Demo — Context for LLM Agents

**Repo**: https://github.com/halftermeyer/n20s-cosmo-rd

## What This Project Is

A demo application built on top of [n20s](https://github.com/halftermeyer/neo4j-n20s) — a Neo4j plugin for in-memory RDF reasoning from Cypher. Read the n20s [CONTEXT.md](https://github.com/halftermeyer/neo4j-n20s/blob/main/CONTEXT.md) for the plugin's philosophy and API.

This demo shows **graph-native cosmetics R&D**: using Neo4j + GDS + n20s together to screen candidate formulations for a new product.

## The Domain: Cosmetics Formulation

A cosmetic product (serum, cream, lotion) is a **multi-level bill of materials (BOM)**:

```
Product (100%)
├── Water Phase (60-70%)
│   ├── Water (90-95% of phase)
│   ├── Humectant (3-5%)
│   ├── Vitamin Derivative (1-3%)
│   └── Preservative (0.5-1%)
├── Oil Phase (20-30%)
│   ├── Emollient (70-85% of phase)
│   ├── Stabilizer (5-10%)
│   └── Active Oil Blend (10-20%)
│       ├── Active Ingredient (2-5% of blend)
│       └── Carrier Oil (95-98%)
└── Active Phase (5-10%)
    ├── Antioxidant (30-50% of phase)
    └── Specialty Active (50-70%)
```

Each `CONTAINS` relationship carries a `ratio` property. The final concentration of any ingredient in the product is the product of all ratios along the path:

```cypher
MATCH path = (p:Product)-[:CONTAINS*]->(i:Ingredient)
WITH p, i, reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
RETURN p.name, i.name, round(finalConc * 100, 4) AS pct
```

## Data Model (LPG)

```
(:Ingredient {name, inci, cas, cost, turtle})
    -[:BELONGS_TO]->(:Category {name})           // functional role
    -[:COMPATIBLE_WITH]->(:Ingredient)            // known synergy
    -[:INCOMPATIBLE_WITH]->(:Ingredient)          // known conflict
    -[:SUBSTITUTE_FOR]->(:Ingredient)             // replacement candidate
    -[:SUPPLIED_BY]->(:Supplier {name, country})

(:Product {name, sku, type})
    -[:CONTAINS {ratio}]->(:Phase/:PreMix/:Ingredient)  // BOM tree
    -[:SOLD_IN]->(:Market {name, regulation})
    -[:PRODUCED_BY]->(:Brand {name})
    -[:IN_LINE]->(:ProductLine {name})

(:Phase {name})
    -[:CONTAINS {ratio}]->(:PreMix/:Ingredient)

(:PreMix {name})
    -[:CONTAINS {ratio}]->(:Ingredient)
```

## RDF Knowledge (Turtle Cargo on Nodes)

Each ingredient with regulatory or classification knowledge carries a `turtle` property:

```cypher
(:Ingredient {name: 'Retinol', inci: 'RETINOL', cas: '68-26-8',
  turtle: '
    @prefix cosmo: <http://example.org/cosmo#> .
    cosmo:Retinol a cosmo:RetinoidAgent, cosmo:PhotosensitiveAgent ;
        cosmo:maxConcentrationEU "0.05" ;
        cosmo:maxConcentrationChina "0.5" .
  '})
```

Shared ontology and SHACL shapes are on dedicated nodes:

```cypher
(:Ontology {name: 'cosmo', turtle: '...'})      // class hierarchy + rules
(:SHACLRules {name: 'cosmo_validation', turtle: '...'})  // regulatory shapes
```

## Ingredient Categories (Functional Roles)

| Category | Examples | Count |
|----------|----------|-------|
| Humectant | Hyaluronic Acid, Glycerin, Betaine | 8-12 |
| Emollient | Squalane, Jojoba Oil, Shea Butter | 10-15 |
| RetinoidAgent | Retinol, Retinal, Retinyl Palmitate | 4-6 |
| RetinoidAlternative | Bakuchiol | 2-3 |
| Antioxidant | Tocopherol, Ascorbic Acid, Ferulic Acid | 7-10 |
| AHA Exfoliant | Glycolic Acid, Lactic Acid, Mandelic Acid | 5-7 |
| BHA Exfoliant | Salicylic Acid | 1-2 |
| UV Filter | Zinc Oxide, Titanium Dioxide, Avobenzone | 5-8 |
| Preservative | Phenoxyethanol, Potassium Sorbate | 4-6 |
| Surfactant | Polysorbate 20, Cetearyl Glucoside | 5-8 |
| Thickener | Xanthan Gum, Carbomer, Cellulose | 5-7 |
| VitaminDerivative | Niacinamide, Panthenol, Biotin | 5-8 |
| PlantExtract | Green Tea, Centella Asiatica, Licorice Root | 10-15 |
| Peptide | Matrixyl, Argireline, Copper Peptide | 5-8 |
| Ceramide | Ceramide NP, Ceramide AP, Phytosphingosine | 4-5 |
| FragranceComponent | Linalool, Limonene, Geraniol | 5-8 |

Target: **150-200 ingredients** total.

## Regulation Data

Real references from:
- **EU**: EC 1223/2009 — Annex II (banned), Annex III (restricted with limits), Annex IV (colorants), Annex V (preservatives), Annex VI (UV filters)
- **US**: FDA 21 CFR Parts 700-740
- **China**: NMPA Cosmetics Safety Technical Standards 2015
- **Japan**: MHLW Standards of Cosmetics

Key regulated ingredients with real limits:
| Ingredient | EU Limit | Annex | Notes |
|------------|----------|-------|-------|
| Retinol | 0.05% (face), 0.3% (hand) | III/98a | Recent 2024 restriction |
| Salicylic Acid | 2% | III/98 | Not in products for children < 3 |
| Glycolic Acid | 10% | - | pH > 3.5 required |
| Phenoxyethanol | 1% | V/29 | Preservative limit |
| Zinc Oxide (nano) | 25% | VI/30a | UV filter, nano form notification required |

## The Three-Pass Pipeline

### Pass 1: GDS Discovery

Project an ingredient co-occurrence graph into GDS:

```cypher
// Build co-occurrence: two ingredients appear in the same product
MATCH (i1:Ingredient)<-[:CONTAINS*]-(:Product)-[:CONTAINS*]->(i2:Ingredient)
WHERE id(i1) < id(i2)
WITH i1, i2, count(*) AS coCount
MERGE (i1)-[r:CO_OCCURS]->(i2) SET r.weight = coCount
```

Then run:
- **Louvain community detection** → ingredient clusters
- **Node similarity** → closest existing product to target
- **PageRank** → most versatile ingredients

### Pass 2: Cypher Combinatorial Generation

```cypher
// Template: Anti-Aging Serum
MATCH (h:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Humectant'})
MATCH (e:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Emollient'})
MATCH (r:Ingredient)-[:BELONGS_TO]->(:Category {name: 'RetinoidAgent'})
MATCH (a:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Antioxidant'})
MATCH (p:Ingredient)-[:BELONGS_TO]->(:Category {name: 'Preservative'})
WHERE NOT (r)-[:INCOMPATIBLE_WITH]-(a)
  AND NOT (h)-[:INCOMPATIBLE_WITH]-(e)
RETURN h, e, r, a, p
```

Filter with concentration constraints, generate BOMs, compute final concentrations.

### Pass 3: n20s Semantic Validation

For top candidates:
```cypher
// Project candidate ingredients + ontology + SHACL
// Validate with RDFS + custom rules + SHACL
CALL n20s.graph.queryWithRules('candidate',
    'SELECT ?issue WHERE { ... }',
    '[regulation rules with greaterThan builtins]',
    'RDFS')
```

## Data Generation

Ingredients should be generated as a Python or Cypher script with:
- Real INCI names and CAS numbers
- Realistic cost ranges per category
- Turtle properties with RDF classification
- Real EU regulation limits where applicable
- Compatibility/incompatibility relationships based on known cosmetic chemistry

Products (30-50) should be template-generated:
- Realistic multi-level BOMs (Product → Phase → PreMix → Ingredient)
- Ratios that sum to 1.0 at each level
- Mix of product types: serums, creams, lotions, peels, sunscreens

## Technical Notes

### n20s API Used
- `n20s.graph.addTurtle(name, turtle)` — project Turtle cargo
- `n20s.graph.query(name, sparql, 'RDFS')` — backward chaining
- `n20s.graph.queryWithRules(name, sparql, rules, 'RDFS')` — RDFS + custom rules
- `n20s.graph.inferWithRules(name, rules, 'RDFS')` — forward chaining with combined reasoning
- `n20s.graph.validate(name)` — SHACL validation
- `n20s.graph.toTurtle(name)` — export for audit

### Cypher Conventions
- Semicolons separate statements in `.cypher` files
- Step 0 cleans both Neo4j data and n20s in-memory graphs
- Turtle in single-quoted Cypher strings, double-quoted Turtle literals inside
- SPARQL inside `sh:select` must be single-line with its own PREFIX declarations

### Connection
Credentials in `../.env` (parent directory):
```
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=pierre!!!
```

Use single quotes around the password in cypher-shell (the `!` triggers zsh history expansion in double quotes).
