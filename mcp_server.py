"""
MCP Server: Cosmetics R&D — Formulation Screening with Neo4j + GDS + n20s

A Model Context Protocol server that lets an LLM interact with the
cosmetics R&D demo. Exposes tools for exploring ingredients, analyzing
products, generating candidates, validating formulations, and exporting
RDF for audit.

Every tool returns a `cypher_audit_trail` section with the exact
Cypher/SPARQL/Jena-rules statements that were executed.

Usage:
    python mcp_server.py          # stdio mode (for Claude Code / Claude Desktop)
    python mcp_server.py --sse    # SSE mode (for web clients)
"""

import os
import json
import textwrap
from pathlib import Path
from threading import local

from dotenv import load_dotenv
from neo4j import GraphDatabase
from mcp.server.fastmcp import FastMCP

load_dotenv(Path(__file__).parent / ".env")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

mcp = FastMCP(
    "n20s Cosmetics R&D Demo",
    instructions="""You are connected to a Neo4j graph database running the n20s
Cosmetics R&D demo. The graph contains 153 ingredients (with real INCI names,
CAS numbers, and RDF Turtle cargo carrying classification + regulation limits),
36 products with multi-level BOMs, suppliers, markets, and compatibility data.

Use the available tools to:
- Explore ingredients, their RDF classifications, and regulation limits
- Analyze product BOMs and ingredient co-occurrence
- Generate candidate formulations by picking functional slots
- Validate candidates against EU/US/China/Japan regulation limits using n20s
  (RDFS inference + Jena rules with greaterThan builtins + SHACL validation)
- Export validated formulations as Turtle for audit

IMPORTANT: Every tool response includes a `cypher_audit_trail` section containing
the exact Cypher and SPARQL statements that were executed. When presenting results,
ALWAYS show this audit trail in a fenced cypher code block so the audience can
reproduce the computation in Neo4j Browser or cypher-shell.""",
)

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# ─── Query tracker ────────────────────────────────────────────

_thread_local = local()


def _get_trail() -> list[str]:
    if not hasattr(_thread_local, "trail"):
        _thread_local.trail = []
    return _thread_local.trail


def _reset_trail():
    _thread_local.trail = []


def _fmt_query(query: str, params: dict | None = None) -> str:
    q = textwrap.dedent(query).strip()
    if params:
        comment_params = ", ".join(
            f"{k}: {json.dumps(v, default=str)[:200]}"
            for k, v in params.items()
        )
        if comment_params:
            q = f"// Parameters: {comment_params}\n{q}"
    return q


def run_cypher(query: str, params: dict | None = None) -> list[dict]:
    _get_trail().append(_fmt_query(query, params))
    with driver.session() as session:
        result = session.run(query, params or {})
        return [dict(r) for r in result]


def _build_response(results, label: str = "results") -> str:
    trail = _get_trail()
    audit = "\n\n".join(f"// Step {i+1}\n{q}" for i, q in enumerate(trail))
    response = {
        label: results,
        "cypher_audit_trail": audit,
    }
    return json.dumps(response, indent=2, default=str)


# ─── Tools ────────────────────────────────────────────────────


@mcp.tool()
def load_demo() -> str:
    """Load (or reload) the cosmetics R&D demo data into Neo4j.
    Creates ingredients with RDF turtle cargo, products with multi-level BOMs,
    categories, suppliers, markets, ontology, and SHACL rules."""
    _reset_trail()
    cypher_file = Path(__file__).parent / "data" / "load_data.cypher"
    content = cypher_file.read_text()

    # Run the full load file
    _get_trail().append("// [Full load from data/load_data.cypher — 153 ingredients, 36 products, ontology, SHACL]")
    with driver.session() as session:
        for statement in content.split(";"):
            stmt = statement.strip()
            if stmt and not stmt.startswith("//"):
                try:
                    session.run(stmt)
                except Exception:
                    pass

    counts = run_cypher(
        "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY label"
    )
    summary = ", ".join(f"{r['count']} {r['label']}" for r in counts)
    return _build_response(f"Demo loaded: {summary}", "status")


@mcp.tool()
def run_query(cypher: str) -> str:
    """Run a Cypher query against the Neo4j database.
    Use this for custom queries or exploring the graph."""
    _reset_trail()
    results = run_cypher(cypher)
    if not results:
        return _build_response("Query returned no results.", "status")
    return _build_response(results)


@mcp.tool()
def list_ingredients(category: str = "") -> str:
    """List ingredients, optionally filtered by category.
    Categories: Humectant, Emollient, RetinoidAgent, Antioxidant, Preservative,
    AHAExfoliant, BHAExfoliant, UVFilter, Surfactant, Thickener,
    VitaminDerivative, PlantExtract, Peptide, Ceramide, FragranceComponent."""
    _reset_trail()
    if category:
        results = run_cypher("""
            MATCH (i:Ingredient)-[:BELONGS_TO]->(c:Category {name: $cat})
            RETURN i.name AS name, i.inci AS inci, i.cas AS cas, i.cost AS cost
            ORDER BY i.name
        """, {"cat": category})
    else:
        results = run_cypher("""
            MATCH (i:Ingredient)-[:BELONGS_TO]->(c:Category)
            RETURN c.name AS category, collect(i.name) AS ingredients, count(i) AS count
            ORDER BY c.name
        """)
    return _build_response(results, "ingredients")


@mcp.tool()
def inspect_ingredient(ingredient_name: str) -> str:
    """Inspect an ingredient: INCI name, CAS, cost, category,
    RDF classification (via RDFS inference), and regulation limits."""
    _reset_trail()
    graph_name = "inspect_tmp"

    info = run_cypher("""
        MATCH (i:Ingredient {name: $name})-[:BELONGS_TO]->(c:Category)
        RETURN i.name AS name, i.inci AS inci, i.cas AS cas,
               i.cost AS cost, c.name AS category, i.turtle AS turtle
    """, {"name": ingredient_name})

    if not info:
        return _build_response(f"Ingredient '{ingredient_name}' not found.", "error")

    ing = info[0]

    # RDF classification via n20s
    try:
        safe_name = "".join(c for c in ingredient_name if c.isalnum())
        run_cypher("""
            MATCH (i:Ingredient {name: $name})
            CALL n20s.graph.addTurtle($graph, i.turtle)
            YIELD graphName, added
            RETURN added
        """, {"name": ingredient_name, "graph": graph_name})

        run_cypher("""
            MATCH (ont:Ontology {name: 'cosmo'})
            CALL n20s.graph.addTurtle($graph, ont.turtle)
            YIELD graphName, added
            RETURN added
        """, {"graph": graph_name})

        classes = run_cypher(f"""
            CALL n20s.graph.query($graph, '
              PREFIX cosmo: <http://example.org/cosmo#>
              PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
              SELECT ?className WHERE {{
                cosmo:{safe_name} rdf:type ?className .
                FILTER(STRSTARTS(STR(?className), "http://example.org/cosmo#"))
              }}
            ', 'RDFS') YIELD row
            RETURN replace(row.className, 'http://example.org/cosmo#', '') AS className
        """, {"graph": graph_name})

        run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
                   {"graph": graph_name})
    except Exception:
        classes = []
        try:
            run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
                       {"graph": graph_name})
        except Exception:
            pass

    # Parse regulation limits from turtle
    limits = {}
    turtle = str(ing.get("turtle", ""))
    import re
    for market in ["EU", "US", "China", "Japan"]:
        match = re.search(rf'maxConcentration{market}\s+"([^"]+)"', turtle)
        if match:
            limits[market] = float(match.group(1))

    result = {
        "name": ing["name"],
        "inci": ing["inci"],
        "cas": ing["cas"],
        "cost": ing["cost"],
        "category": ing["category"],
        "rdfClasses": [c["className"] for c in classes],
        "regulationLimits": limits,
    }
    return _build_response(result, "ingredient")


@mcp.tool()
def get_product_bom(product_name: str) -> str:
    """Get the full BOM (bill of materials) for a product with final concentrations."""
    _reset_trail()
    results = run_cypher("""
        MATCH (p:Product) WHERE p.name = $name OR p.sku = $name
        WITH p
        MATCH path = (p)-[:CONTAINS*]->(i:Ingredient)
        WITH p.name AS product, p.sku AS sku, i.name AS ingredient,
             reduce(conc = 1.0, r IN relationships(path) | conc * r.ratio) AS finalConc
        RETURN product, sku, ingredient, round(finalConc * 100, 4) AS pct
        ORDER BY pct DESC
    """, {"name": product_name})
    if not results:
        return _build_response(f"Product '{product_name}' not found.", "error")
    return _build_response(results, "bom")


@mcp.tool()
def find_incompatibilities(ingredient_names: list[str]) -> str:
    """Check for known incompatibilities between a set of ingredients."""
    _reset_trail()
    results = run_cypher("""
        UNWIND $names AS n1
        UNWIND $names AS n2
        WITH n1, n2 WHERE n1 < n2
        MATCH (a:Ingredient {name: n1})-[:INCOMPATIBLE_WITH]-(b:Ingredient {name: n2})
        RETURN DISTINCT a.name AS ingredient1, b.name AS ingredient2
    """, {"names": ingredient_names})
    if not results:
        return _build_response("No incompatibilities found.", "status")
    return _build_response(results, "incompatibilities")


@mcp.tool()
def validate_formulation(
    ingredients_with_concentrations: list[dict],
) -> str:
    """Validate a candidate formulation against EU/US/China/Japan regulation limits.
    Input: list of {name: str, concentration: float} (concentration as fraction, e.g. 0.05 = 5%).
    Uses n20s: RDFS inference + Jena rules with greaterThan builtins + SHACL validation."""
    _reset_trail()
    graph_name = "validation"

    try:
        run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
                   {"graph": graph_name})
    except Exception:
        pass

    names = [i["name"] for i in ingredients_with_concentrations]

    # Load ingredient turtles
    run_cypher("""
        MATCH (i:Ingredient) WHERE i.name IN $names
        WITH collect(i.turtle) AS turtles
        UNWIND turtles AS t
        CALL n20s.graph.addTurtle($graph, t)
        YIELD graphName, added
        RETURN graphName, sum(added) AS total
    """, {"names": names, "graph": graph_name})

    # Build concentration turtle
    conc_lines = []
    for i in ingredients_with_concentrations:
        safe_name = "".join(c for c in i["name"] if c.isalnum())
        conc_lines.append(
            f'cosmo:{safe_name} cosmo:actualConcentration "{i["concentration"]}"^^xsd:double .'
        )
    conc_turtle = (
        "@prefix cosmo: <http://example.org/cosmo#> .\n"
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n"
        + "\n".join(conc_lines)
    )

    run_cypher("""
        CALL n20s.graph.addTurtle($graph, $turtle)
        YIELD graphName, added
        RETURN added
    """, {"graph": graph_name, "turtle": conc_turtle})

    # Add ontology + SHACL
    run_cypher("""
        MATCH (ont:Ontology {name: 'cosmo'})
        CALL n20s.graph.addTurtle($graph, ont.turtle)
        YIELD graphName, added
        RETURN added
    """, {"graph": graph_name})

    run_cypher("""
        MATCH (sh:SHACLRules {name: 'cosmo_validation'})
        CALL n20s.graph.addTurtle($graph, sh.turtle)
        YIELD graphName, added
        RETURN added
    """, {"graph": graph_name})

    # Run multi-market rules
    rules = """
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
"""

    sparql = """
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
"""

    violations = run_cypher("""
        CALL n20s.graph.queryWithRules($graph, $sparql, $rules, 'RDFS')
        YIELD row
        RETURN row.label AS label, row.actual AS actual, row.limit AS limit, row.market AS market
    """, {"graph": graph_name, "sparql": sparql, "rules": rules})

    # SHACL validation
    shacl = run_cypher("""
        CALL n20s.graph.validate($graph)
        YIELD focusNode, severity, message
        RETURN focusNode, severity, message
    """, {"graph": graph_name})

    run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
               {"graph": graph_name})

    result = {
        "violations": [
            {"ingredient": v["label"], "market": v["market"],
             "actual": v["actual"], "limit": v["limit"]}
            for v in violations
        ],
        "shacl": [
            {"focusNode": s["focusNode"].split("#")[-1] if "#" in str(s["focusNode"]) else s["focusNode"],
             "severity": s["severity"],
             "message": s["message"]}
            for s in shacl
        ],
        "status": "FAIL" if violations else "PASS",
    }
    return _build_response(result, "validation")


@mcp.tool()
def export_turtle(ingredient_names: list[str]) -> str:
    """Export ingredient RDF data as Turtle after RDFS forward-chaining.
    Useful for regulatory audit trails."""
    _reset_trail()
    graph_name = "export"

    try:
        run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
                   {"graph": graph_name})
    except Exception:
        pass

    run_cypher("""
        MATCH (i:Ingredient) WHERE i.name IN $names
        WITH collect(i.turtle) AS turtles
        UNWIND turtles AS t
        CALL n20s.graph.addTurtle($graph, t)
        YIELD graphName, added
        RETURN sum(added) AS total
    """, {"names": ingredient_names, "graph": graph_name})

    run_cypher("""
        MATCH (ont:Ontology {name: 'cosmo'})
        CALL n20s.graph.addTurtle($graph, ont.turtle)
        YIELD graphName, added
        RETURN added
    """, {"graph": graph_name})

    run_cypher("""
        CALL n20s.graph.infer($graph, 'RDFS')
        YIELD newTriples
        RETURN newTriples
    """, {"graph": graph_name})

    rows = run_cypher("""
        CALL n20s.graph.toTurtle($graph)
        YIELD turtle
        RETURN turtle
    """, {"graph": graph_name})

    run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
               {"graph": graph_name})

    turtle_text = rows[0]["turtle"] if rows else ""
    return _build_response({"turtle": turtle_text[:5000]}, "export")


@mcp.tool()
def list_products() -> str:
    """List all products with their type, brand, and product line."""
    _reset_trail()
    results = run_cypher("""
        MATCH (p:Product)-[:PRODUCED_BY]->(b:Brand)
        OPTIONAL MATCH (p)-[:IN_LINE]->(pl:ProductLine)
        OPTIONAL MATCH (p)-[:SOLD_IN]->(m:Market)
        RETURN p.name AS name, p.sku AS sku, p.type AS type,
               b.name AS brand, pl.name AS line,
               collect(m.name) AS markets
        ORDER BY brand, name
    """)
    return _build_response(results, "products")


@mcp.tool()
def classify_ingredients_rdf(category: str) -> str:
    """Classify all ingredients in a category using RDFS inference.
    Shows the full RDF class hierarchy for each ingredient."""
    _reset_trail()
    graph_name = "classify_tmp"

    try:
        run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
                   {"graph": graph_name})
    except Exception:
        pass

    run_cypher("""
        MATCH (i:Ingredient)-[:BELONGS_TO]->(:Category {name: $cat})
        WITH collect(i.turtle) AS turtles
        UNWIND turtles AS t
        CALL n20s.graph.addTurtle($graph, t)
        YIELD graphName, added
        RETURN sum(added) AS total
    """, {"cat": category, "graph": graph_name})

    run_cypher("""
        MATCH (ont:Ontology {name: 'cosmo'})
        CALL n20s.graph.addTurtle($graph, ont.turtle)
        YIELD graphName, added
        RETURN added
    """, {"graph": graph_name})

    results = run_cypher("""
        CALL n20s.graph.query($graph, '
          PREFIX cosmo: <http://example.org/cosmo#>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
          SELECT ?label ?className WHERE {
            ?ing rdf:type ?class .
            ?ing rdfs:label ?label .
            FILTER(STRSTARTS(STR(?class), "http://example.org/cosmo#"))
            BIND(REPLACE(STR(?class), "http://example.org/cosmo#", "") AS ?className)
          }
          ORDER BY ?label ?className
        ', 'RDFS') YIELD row
        RETURN row.label AS ingredient, row.className AS rdfClass
    """, {"graph": graph_name})

    run_cypher("CALL n20s.graph.drop($graph) YIELD graphName RETURN graphName",
               {"graph": graph_name})

    # Group by ingredient
    grouped: dict[str, list[str]] = {}
    for r in results:
        grouped.setdefault(r["ingredient"], []).append(r["rdfClass"])

    return _build_response(grouped, "classifications")


if __name__ == "__main__":
    import sys
    if "--sse" in sys.argv:
        mcp.run(transport="sse")
    else:
        mcp.run()
