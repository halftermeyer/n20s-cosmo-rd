# n20s Cosmetics R&D Demo

Graph-native cosmetics R&D: discover ingredient clusters with GDS, generate candidate formulations with Cypher, validate against regulations with n20s.

## The Problem

A cosmetics R&D team wants to build a new anti-aging serum for the EU market. Which ingredient combinations are viable, compatible, and compliant?

Today this is done with Excel, tribal knowledge, and manual regulatory checks. This demo shows a graph-native alternative.

## The Three-Pass Pipeline

```
Pass 1: GDS — discovery
  Community detection on ingredient co-occurrence → ingredient clusters
  Node similarity → closest existing product to target profile

Pass 2: Cypher — combinatorial generation
  Cross-join candidates per functional slot (Humectant × Emollient × Active × ...)
  Filter: known incompatibilities, banned ingredients, concentration limits
  Compute BOM concentrations with reduce()

Pass 3: n20s — semantic validation
  RDFS: infer full ingredient classification (catches indirect incompatibilities)
  Custom rules: domain-specific constraints with numeric builtins
  SHACL: validate against regulatory shapes per market
```

## Prerequisites

- Neo4j 2025.x / 2026.x
- [n20s plugin](https://github.com/halftermeyer/neo4j-n20s) installed
- GDS plugin (optional — demo degrades gracefully without it)

## Structure

```
data/           — ingredient database, ontology, SHACL shapes
demo/           — .cypher demo scripts
demo_bookmarks/ — Neo4j Browser bookmark CSV
```

## Status

Under construction.
