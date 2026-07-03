# n20s Cosmetics R&D Demo

A demo application showcasing **Neo4j + n20s** capabilities: combining property graph traversal with in-memory RDF reasoning (RDFS inference, Jena rules, SHACL validation) for cosmetics formulation screening.

Built on [n20s](https://github.com/halftermeyer/neo4j-n20s) — a Neo4j plugin (and standalone server) for in-memory RDF reasoning from Cypher.

## What It Demonstrates

- **Multi-level BOM traversal** — Cypher walks Product → Phase → PreMix → Ingredient trees, multiplying concentration ratios with `reduce()`
- **RDF classification** — RDFS backward chaining infers ingredient classes (e.g., Retinol is a `PhotosensitiveAgent`) from ontology hierarchies
- **Multi-market regulation** — Jena rules with `greaterThan` builtins check EU/US/China/Japan concentration limits in a single pass
- **SHACL validation** — shape constraints enforce labeling requirements per market
- **Scenario analysis** — regulatory change impact, supplier disruption cascade, allergen reclassification propagation
- **Dual mode** — works with n20s as a Neo4j plugin or as a standalone HTTP server (for Aura/managed environments)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  React App  │────▶│   Neo4j      │────▶│  n20s plugin   │
│  (Needle)   │     │  (Cypher)    │     │  (Jena in JVM) │
└─────────────┘     └──────────────┘     └────────────────┘
       │                                         OR
       └────────────────────────────────▶┌────────────────┐
                                         │  n20s server   │
                                         │  (HTTP REST)   │
                                         └────────────────┘
```

## Quick Start

```bash
# 1. Load data into Neo4j
python3 generate_data.py
cat data/load_data.cypher | cypher-shell -u neo4j -p '<password>'

# 2. Start the React app
cd app
cp .env.example .env   # edit with your credentials
npm install
npm run dev
```

### Environment variables (`app/.env`)

```
VITE_NEO4J_URI=bolt://127.0.0.1:7687
VITE_NEO4J_USER=neo4j
VITE_NEO4J_PASSWORD=<password>
VITE_GEMINI_API_KEY=<key>          # optional — for the Assistant tab

# To use n20s-server instead of the plugin:
# VITE_N20S_MODE=server
# VITE_N20S_URL=http://localhost:7475
```

## Prerequisites

- **Neo4j** 5.x / 2025.x / 2026.x
- **n20s plugin** v1.1.0+ ([neo4j-n20s](https://github.com/halftermeyer/neo4j-n20s)) — OR n20s-server for managed environments
- **Python 3** — for data generation
- **Node.js 18+** — for the React app

## Structure

```
generate_data.py          — Python script generating 153 ingredients, 36 products
data/load_data.cypher     — generated Cypher load file
data/demo_queries.cypher  — standalone demo queries (5-pass pipeline)
mcp_server.py             — MCP server for Claude Code / Claude Desktop
demo-script.md            — walkthrough script with talking points
app/                      — React app (Vite + TypeScript + @neo4j-ndl/react)
  src/lib/neo4j.ts        — Neo4j driver + audit logging
  src/lib/n20s.ts         — n20s abstraction (plugin vs server mode)
  src/lib/queries.ts      — Cypher + n20s query functions
  src/lib/scenarioQueries.ts — 4 scenario use cases
  src/components/          — Explore, Formulate, Scenarios, Assistant tabs
```

## Data Model

```
(:Ingredient {name, inci, cas, cost, turtle})
    -[:BELONGS_TO]->(:Category)
    -[:INCOMPATIBLE_WITH]->(:Ingredient)
    -[:COMPATIBLE_WITH]->(:Ingredient)
    -[:SUBSTITUTE_FOR]->(:Ingredient)
    -[:SUPPLIED_BY]->(:Supplier)

(:Product {name, sku, type})
    -[:CONTAINS {ratio}]->(:Phase/:PreMix/:Ingredient)
    -[:SOLD_IN]->(:Market)
    -[:PRODUCED_BY]->(:Brand)

(:Ontology {name, turtle})
(:SHACLRules {name, turtle})
```

Each ingredient's `turtle` property carries RDF classification and regulation limits as typed `xsd:double` values.

## License

Apache 2.0
