---
marp: true
theme: neo4j
paginate: true
math: katex
---

<!-- _class: lead -->

![width:160px](assets/logo-white.png)

# n20s: In-Memory RDF Reasoning from Cypher
### Scope first, reason second

Pierre Halftermeyer · Neo4j

---

## The Problem

You have a **property graph** with rich structure — BOMs, supply chains, patient records.

You also have **domain knowledge** — ontologies, regulation limits, classification hierarchies.

<div style="display:flex; gap:2rem; margin-top:1rem;">
<div>

### Cypher excels at
- Multi-hop traversal
- Path aggregation
- Pattern matching at scale

</div>
<div>

### But can't do
- Class hierarchy inference
- Rule-based entailment
- SHACL validation

</div>
</div>

---


<!-- _class: dense -->
## What if you could do both?

<pre class="hljs language-cypher"><code><span class="hljs-comment">// Cypher scopes — walk the graph, project triples</span>
<span class="hljs-keyword">MATCH</span> (p:<span class="hljs-type">Product</span>)-[:<span class="hljs-type">CONTAINS</span>*]-&gt;(i:<span class="hljs-type">Ingredient</span>)-[:<span class="hljs-type">HAS_TRIPLE</span>]-&gt;(t:<span class="hljs-type">Triple</span>)
<span class="hljs-keyword">WITH</span><span class="hljs-functionCall"> n20s.<span class="hljs-built_in">graph</span>.project(&#x27;check&#x27;, t.s, t.p, t.o)</span> <span class="hljs-keyword">AS</span> g
<span class="hljs-keyword">RETURN</span> g.tripleCount;

<span class="hljs-comment">// n20s reasons over the scoped set</span>
<span class="hljs-keyword">CALL</span><span class="hljs-functionCall"> n20s.<span class="hljs-built_in">graph</span>.queryWithRules(&#x27;check&#x27;, $sparql, $rules, &#x27;RDFS&#x27;)</span>
<span class="hljs-keyword">YIELD</span> row <span class="hljs-keyword">RETURN</span> row;</code></pre>

**Cypher** traverses the graph and scopes the RDF triple set.
**n20s** reasons over it — RDFS inference, custom rules, SHACL.

Think **GDS projections**, but for RDF reasoning instead of graph algorithms.

---

<!-- _class: lead -->

# What is n20s?

---


<!-- _class: dense -->
## n20s — A Custom Neo4j Plugin

An **open-source Neo4j plugin** that brings RDF reasoning into Cypher workflows.

- Built on **Apache Jena** — production-grade RDF engine
- **Ephemeral in-memory graphs** — no persistent triple store
- **Not a SPARQL endpoint** — a reasoning engine embedded in Cypher
- Works alongside **GDS**, **APOC**, and standard Cypher

> **Key principle:** RDF triples travel as "cargo" on LPG nodes — your graph model stays clean.

*github.com/halftermeyer/neo4j-n20s*

---


<!-- _class: dense -->
## How It Works

<div class="mermaid-diagram"><svg id="my-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 764.781px; background-color: transparent;" viewBox="0 0 764.78125 478" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;fill:#1B1B1B;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#FCF9F6;}#my-svg .error-text{fill:#1B1B1B;stroke:#1B1B1B;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#0A6190;stroke:#0A6190;}#my-svg .marker.cross{stroke:#0A6190;}#my-svg svg{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;}#my-svg p{margin:0;}#my-svg .label{font-family:ui-sans-serif,system-ui,sans-serif;color:#014063;}#my-svg .cluster-label text{fill:#014063;}#my-svg .cluster-label span{color:#014063;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#014063;color:#014063;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#E8F3F8;stroke:#0A6190;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#0A6190!important;stroke-width:0;stroke:#0A6190;}#my-svg .arrowheadPath{fill:#000000;}#my-svg .edgePath .path{stroke:#0A6190;stroke-width:2.0px;}#my-svg .flowchart-link{stroke:#0A6190;fill:none;}#my-svg .edgeLabel{background-color:#F5F7FA;text-align:center;}#my-svg .edgeLabel p{background-color:#F5F7FA;}#my-svg .edgeLabel rect{opacity:0.5;background-color:#F5F7FA;fill:#F5F7FA;}#my-svg .labelBkg{background-color:rgba(245, 247, 250, 0.5);}#my-svg .cluster rect{fill:#F0F5F8;stroke:#4C99A4;stroke-width:1px;}#my-svg .cluster text{fill:#014063;}#my-svg .cluster span{color:#014063;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;background:#FCF9F6;border:1px solid #8FE3E8;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#1B1B1B;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:#F5F7FA;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:#F5F7FA;padding:2px;}#my-svg .icon-shape rect,#my-svg .image-shape rect{opacity:0.5;background-color:#F5F7FA;fill:#F5F7FA;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M175.227,175L185.542,175C195.857,175,216.487,175,236.139,179.552C255.791,184.103,274.465,193.206,283.802,197.758L293.139,202.309" id="L_A_B_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MTc1LjIyNjU2MjUsInkiOjE3NX0seyJ4IjoyMzcuMTE3MTg3NSwieSI6MTc1fSx7IngiOjI5Ni43MzQzNzUsInkiOjIwNC4wNjE4MjY4MzcyNTA4fV0=" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M177.5,303L187.436,303C197.372,303,217.245,303,236.518,298.448C255.791,293.897,274.465,284.794,283.802,280.242L293.139,275.691" id="L_C_B_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_C_B_0" data-points="W3sieCI6MTc3LjUsInkiOjMwM30seyJ4IjoyMzcuMTE3MTg3NSwieSI6MzAzfSx7IngiOjI5Ni43MzQzNzUsInkiOjI3My45MzgxNzMxNjI3NDkyfV0=" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M399.672,200L420.114,174.5C440.557,149,481.443,98,517.573,72.5C553.703,47,585.078,47,600.766,47L616.453,47" id="L_B_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_D_0" data-points="W3sieCI6Mzk5LjY3MTYzMDg1OTM3NSwieSI6MjAwfSx7IngiOjUyMi4zMjgxMjUsInkiOjQ3fSx7IngiOjYyMC40NTMxMjUsInkiOjQ3fV0=" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M440.078,209.199L453.786,203.499C467.495,197.799,494.911,186.4,521.661,180.7C548.411,175,574.495,175,587.536,175L600.578,175" id="L_B_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_E_0" data-points="W3sieCI6NDQwLjA3ODEyNSwieSI6MjA5LjE5OTE2NzU5NzE5ODI1fSx7IngiOjUyMi4zMjgxMjUsInkiOjE3NX0seyJ4Ijo2MDQuNTc4MTI1LCJ5IjoxNzV9XQ==" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M440.078,268.801L453.786,274.501C467.495,280.201,494.911,291.6,525.072,297.3C555.232,303,588.135,303,604.587,303L621.039,303" id="L_B_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_F_0" data-points="W3sieCI6NDQwLjA3ODEyNSwieSI6MjY4LjgwMDgzMjQwMjgwMTc1fSx7IngiOjUyMi4zMjgxMjUsInkiOjMwM30seyJ4Ijo2MjUuMDM5MDYyNSwieSI6MzAzfV0=" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M399.672,278L420.114,303.5C440.557,329,481.443,380,518.667,405.5C555.891,431,589.453,431,606.234,431L623.016,431" id="L_B_G_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_G_0" data-points="W3sieCI6Mzk5LjY3MTYzMDg1OTM3NSwieSI6Mjc4fSx7IngiOjUyMi4zMjgxMjUsInkiOjQzMX0seyJ4Ijo2MjcuMDE1NjI1LCJ5Ijo0MzF9XQ==" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel" transform="translate(237.1171875, 175)"><g class="label" data-id="L_A_B_0" transform="translate(-34.6171875, -12)"><foreignObject width="69.234375" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>addTurtle</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(237.1171875, 303)"><g class="label" data-id="L_C_B_0" transform="translate(-34.6171875, -12)"><foreignObject width="69.234375" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>addTurtle</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(522.328125, 47)"><g class="label" data-id="L_B_D_0" transform="translate(-47.3203125, -12)"><foreignObject width="94.640625" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>query / RDFS</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(522.328125, 175)"><g class="label" data-id="L_B_E_0" transform="translate(-57.25, -12)"><foreignObject width="114.5" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>queryWithRules</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(522.328125, 303)"><g class="label" data-id="L_B_F_0" transform="translate(-28.09375, -12)"><foreignObject width="56.1875" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>validate</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(522.328125, 431)"><g class="label" data-id="L_B_G_0" transform="translate(-27.3203125, -12)"><foreignObject width="54.640625" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>toTurtle</p></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="flowchart-A-0" transform="translate(92.75, 175)"><rect class="basic label-container" style="" x="-82.4765625" y="-39" width="164.953125" height="78"/><g class="label" style="" transform="translate(-52.4765625, -24)"><rect/><foreignObject width="104.953125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>LPG Node<br />turtle property</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-B-1" transform="translate(368.40625, 239)"><rect class="basic label-container" style="" x="-71.671875" y="-39" width="143.34375" height="78"/><g class="label" style="" transform="translate(-41.671875, -24)"><rect/><foreignObject width="83.34375" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>In-Memory<br />Jena Graph</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-C-2" transform="translate(92.75, 303)"><rect class="basic label-container" style="" x="-84.75" y="-39" width="169.5" height="78"/><g class="label" style="" transform="translate(-54.75, -24)"><rect/><foreignObject width="109.5" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>Ontology Node<br />turtle property</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-D-5" transform="translate(680.6796875, 47)"><rect class="basic label-container" style="" x="-60.2265625" y="-39" width="120.453125" height="78"/><g class="label" style="" transform="translate(-30.2265625, -24)"><rect/><foreignObject width="60.453125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>SPARQL<br />Results</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-E-7" transform="translate(680.6796875, 175)"><rect class="basic label-container" style="" x="-76.1015625" y="-39" width="152.203125" height="78"/><g class="label" style="" transform="translate(-46.1015625, -24)"><rect/><foreignObject width="92.203125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>Custom Rule<br />Results</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-F-9" transform="translate(680.6796875, 303)"><rect class="basic label-container" style="" x="-55.640625" y="-39" width="111.28125" height="78"/><g class="label" style="" transform="translate(-25.640625, -24)"><rect/><foreignObject width="51.28125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>SHACL<br />Report</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-G-11" transform="translate(680.6796875, 431)"><rect class="basic label-container" style="" x="-53.6640625" y="-39" width="107.328125" height="78"/><g class="label" style="" transform="translate(-23.6640625, -24)"><rect/><foreignObject width="47.328125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>Turtle<br />Export</p></span></div></foreignObject></g></g></g></g></g></svg></div>

1. **Scope** — Cypher selects which nodes carry relevant RDF
2. **Project** — `addTurtle` loads their cargo into a named in-memory graph
3. **Reason** — RDFS, custom rules, SHACL — all in-memory
4. **Drop** — graph is freed, no trace left

---


<!-- _class: dense -->
## RDF Cargo on LPG Nodes

Each node carries its RDF knowledge as a `turtle` property:

<pre class="hljs language-cypher"><code>(:<span class="hljs-type">Ingredient</span> {name: <span class="hljs-string">&#x27;Retinol&#x27;</span>, inci: <span class="hljs-string">&#x27;RETINOL&#x27;</span>,
  turtle: <span class="hljs-string">&#x27;
    @prefix cosmo: &lt;http://example.org/cosmo#&gt; .
    cosmo:Retinol a cosmo:RetinoidAgent,
                    cosmo:PhotosensitiveAgent ;
        cosmo:maxConcentrationEU &quot;0.05&quot;^^xsd:double .
  &#x27;</span>})</code></pre>

- **LPG** stores structure — BOMs, suppliers, markets
- **RDF** stores classification — ontology types, regulation limits
- They coexist on the same node without polluting each other

---

<!-- _class: lead periwinkle -->

# Core API

---

<!-- _class: dense -->

## The 8 Key Operations

| Procedure | What it does | Reasoning |
|---|---|---|
| `addTurtle(name, turtle)` | Parse Turtle string into named graph | — |
| `query(name, sparql, profile)` | SPARQL SELECT with backward chaining | RDFS, OWL |
| `queryWithRules(name, sparql, rules, profile)` | SPARQL + custom Jena rules | RDFS + rules |
| `infer(name, profile)` | Forward-chain — materialize all entailments | RDFS, OWL |
| `inferWithRules(name, rules, profile)` | Forward-chain with custom rules | RDFS + rules |
| `validate(name)` | Run SHACL shapes against the graph | SHACL |
| `toTurtle(name)` | Export graph as Turtle string | — |
| `drop(name)` | Free memory | — |

**Plus:** `n20s.graph.project(name, s, p, o)` — aggregating function to build triples from Cypher results

---


<!-- _class: dense -->
## Reasoning Profiles

<div style="display:flex; gap:2rem;">
<div>

### Backward Chaining
*"Reason on the fly"*

<pre class="hljs language-cypher"><code><span class="hljs-keyword">CALL</span><span class="hljs-functionCall"> n20s.<span class="hljs-built_in">graph</span>.query(&#x27;g&#x27;,
  &#x27;SELECT ?x WHERE {
     ?x rdf:<span class="hljs-built_in">type</span> cosmo:Allergen
   }&#x27;,
  &#x27;RDFS&#x27;)</span></code></pre>

Infers `Retinol` is an `Allergen` if `RetinoidAgent rdfs:subClassOf Allergen` — without materializing.

</div>
<div>

### Forward Chaining
*"Materialize everything"*

<pre class="hljs language-cypher"><code><span class="hljs-keyword">CALL</span><span class="hljs-functionCall"> n20s.<span class="hljs-built_in">graph</span>.infer(&#x27;g&#x27;, &#x27;RDFS&#x27;)</span>
<span class="hljs-keyword">YIELD</span> triplesBefore, triplesAfter
<span class="hljs-comment">// 265 → 773 triples</span></code></pre>

All inferred triples added to the graph. Then export with `toTurtle` for audit.

</div>
</div>

---


<!-- _class: dense -->
## Custom Rules with Builtins

Jena rules layered **on top of** RDFS:

<pre class="hljs language-cypher"><code><span class="hljs-keyword">CALL</span><span class="hljs-functionCall"> n20s.<span class="hljs-built_in">graph</span>.queryWithRules(&#x27;g&#x27;, $sparql, &#x27;
[eu_limit:
  (?ing cosmo:actualConcentration ?actual)</span>
  (?ing cosmo:maxConcentrationEU ?limit)<span class="hljs-functionCall">
  greaterThan(?actual, ?limit)</span>
  (?ing rdfs:label ?name)
  -&gt;
  (?ing cosmo:violatesEU ?name)]
<span class="hljs-string">&#x27;, &#x27;</span>RDFS<span class="hljs-string">&#x27;)</span></code></pre>

- RDFS runs first → resolves class hierarchy
- Custom rules fire second → use `greaterThan`, `regex`, `sum`
- SPARQL queries the enriched model

---

<!-- _class: lead marigold -->

# The Use Case
### Cosmetics R&D — Formulation Screening

---


<!-- _class: dense -->
## The Domain

A cosmetic product is a **multi-level bill of materials**:

```
Product (100%)
├── Water Phase (65%)
│   ├── Water (90%)
│   ├── Hyaluronic Acid (4%)
│   └── Preservative (0.8%)
├── Oil Phase (25%)
│   ├── Squalane (80%)
│   └── Active Oil Blend (20%)
│       ├── Retinol (3%)     ← regulated
│       └── Carrier Oil (97%)
└── Active Phase (10%)
    ├── Antioxidant (40%)
    └── Peptide (60%)
```

**Final Retinol concentration** = 25% × 20% × 3% = **0.15%**
Cypher computes this via `reduce` over the BOM path.

---


<!-- _class: dense -->
## The Challenge

153 ingredients · 36 products · 4 markets (EU, US, China, Japan)

<div style="display:flex; gap:2rem;">
<div>

### Questions Cypher alone can't answer
- *"Is Retinol a PhotosensitiveAgent?"*
  (inferred via RDF class hierarchy)
- *"Does this product comply with EU regulation?"*
  (requires `greaterThan` on typed values)
- *"Does this allergen have required labeling?"*
  (SHACL constraint validation)

</div>
<div>

### Questions RDF alone can't answer
- *"What is Retinol's final concentration?"*
  (multi-level BOM traversal × ratio multiplication)
- *"Which supplier's disruption affects the most products?"*
  (graph path aggregation)

</div>
</div>

---

## The Pipeline: Scope → Reason → Validate

<div class="mermaid-diagram"><svg id="my-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 1227.66px; background-color: transparent;" viewBox="0 0 1227.65625 94" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;fill:#1B1B1B;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#FCF9F6;}#my-svg .error-text{fill:#1B1B1B;stroke:#1B1B1B;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#FFA901;stroke:#FFA901;}#my-svg .marker.cross{stroke:#FFA901;}#my-svg svg{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;}#my-svg p{margin:0;}#my-svg .label{font-family:ui-sans-serif,system-ui,sans-serif;color:#4A2D00;}#my-svg .cluster-label text{fill:#014063;}#my-svg .cluster-label span{color:#014063;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#4A2D00;color:#4A2D00;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#FDF0CC;stroke:#C07A00;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#FFA901!important;stroke-width:0;stroke:#FFA901;}#my-svg .arrowheadPath{fill:#000000;}#my-svg .edgePath .path{stroke:#FFA901;stroke-width:2.0px;}#my-svg .flowchart-link{stroke:#FFA901;fill:none;}#my-svg .edgeLabel{background-color:#FFF8E8;text-align:center;}#my-svg .edgeLabel p{background-color:#FFF8E8;}#my-svg .edgeLabel rect{opacity:0.5;background-color:#FFF8E8;fill:#FFF8E8;}#my-svg .labelBkg{background-color:rgba(255, 248, 232, 0.5);}#my-svg .cluster rect{fill:#F0F5F8;stroke:#4C99A4;stroke-width:1px;}#my-svg .cluster text{fill:#014063;}#my-svg .cluster span{color:#014063;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;background:#FCF9F6;border:1px solid #8FE3E8;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#1B1B1B;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:#FFF8E8;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:#FFF8E8;padding:2px;}#my-svg .icon-shape rect,#my-svg .image-shape rect{opacity:0.5;background-color:#FFF8E8;fill:#FFF8E8;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M173.547,47L186.753,47C199.958,47,226.37,47,252.115,47C277.859,47,302.938,47,315.477,47L328.016,47" id="L_A_B_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MTczLjU0Njg3NSwieSI6NDd9LHsieCI6MjUyLjc4MTI1LCJ5Ijo0N30seyJ4IjozMzIuMDE1NjI1LCJ5Ijo0N31d" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M461.25,47L473.592,47C485.935,47,510.62,47,534.638,47C558.656,47,582.008,47,593.684,47L605.359,47" id="L_B_C_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6NDYxLjI1LCJ5Ijo0N30seyJ4Ijo1MzUuMzA0Njg3NSwieSI6NDd9LHsieCI6NjA5LjM1OTM3NSwieSI6NDd9XQ==" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M783.859,47L793.757,47C803.654,47,823.448,47,842.576,47C861.703,47,880.164,47,889.395,47L898.625,47" id="L_C_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6NzgzLjg1OTM3NSwieSI6NDd9LHsieCI6ODQzLjI0MjE4NzUsInkiOjQ3fSx7IngiOjkwMi42MjUsInkiOjQ3fV0=" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M1018.813,47L1025.996,47C1033.18,47,1047.547,47,1061.247,47C1074.948,47,1087.982,47,1094.499,47L1101.016,47" id="L_D_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_D_E_0" data-points="W3sieCI6MTAxOC44MTI1LCJ5Ijo0N30seyJ4IjoxMDYxLjkxNDA2MjUsInkiOjQ3fSx7IngiOjExMDUuMDE1NjI1LCJ5Ijo0N31d" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel" transform="translate(252.78125, 47)"><g class="label" data-id="L_A_B_0" transform="translate(-54.234375, -12)"><foreignObject width="108.46875" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>concentrations</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(535.3046875, 47)"><g class="label" data-id="L_B_C_0" transform="translate(-49.0546875, -12)"><foreignObject width="98.109375" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>RDFS + Rules</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(843.2421875, 47)"><g class="label" data-id="L_C_D_0" transform="translate(-34.3828125, -12)"><foreignObject width="68.765625" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>violations</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1061.9140625, 47)"><g class="label" data-id="L_D_E_0" transform="translate(-18.1015625, -12)"><foreignObject width="36.203125" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>audit</p></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="flowchart-A-0" transform="translate(90.7734375, 47)"><rect class="basic label-container" style="" x="-82.7734375" y="-39" width="165.546875" height="78"/><g class="label" style="" transform="translate(-52.7734375, -24)"><rect/><foreignObject width="105.546875" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>Cypher<br />BOM Traversal</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-B-1" transform="translate(396.6328125, 47)"><rect class="basic label-container" style="" x="-64.6171875" y="-39" width="129.234375" height="78"/><g class="label" style="" transform="translate(-34.6171875, -24)"><rect/><foreignObject width="69.234375" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>n20s<br />addTurtle</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-C-3" transform="translate(696.609375, 47)"><rect class="basic label-container" style="" x="-87.25" y="-39" width="174.5" height="78"/><g class="label" style="" transform="translate(-57.25, -24)"><rect/><foreignObject width="114.5" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>queryWithRules<br />greaterThan</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-D-5" transform="translate(960.71875, 47)"><rect class="basic label-container" style="" x="-58.09375" y="-39" width="116.1875" height="78"/><g class="label" style="" transform="translate(-28.09375, -24)"><rect/><foreignObject width="56.1875" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>SHACL<br />validate</p></span></div></foreignObject></g></g><g class="node default" id="flowchart-E-7" transform="translate(1162.3359375, 47)"><rect class="basic label-container" style="" x="-57.3203125" y="-39" width="114.640625" height="78"/><g class="label" style="" transform="translate(-27.3203125, -24)"><rect/><foreignObject width="54.640625" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>toTurtle<br />Export</p></span></div></foreignObject></g></g></g></g></g></svg></div>

1. **Cypher** walks the BOM tree, computes actual concentrations
2. **n20s** loads ingredient RDF + ontology + concentrations
3. **Jena rules** fire `greaterThan` per market (EU, US, China, Japan)
4. **SHACL** validates labeling requirements
5. **toTurtle** exports the inferred graph for regulatory audit

---

<!-- _class: lead hibiscus -->

# Four Scenarios
### Graph traversal scopes RDF reasoning

---

## 1. Regulatory Change Impact

*"EU just lowered the Retinoid limit. Which products break?"*

**Cypher** traverses `Market ← Product → BOM* → Ingredient`, multiplies ratios.
**RDFS** infers which ingredients are `RetinoidAgent` (catching subclasses).
**Rules** fire `greaterThan` with the new limit.

> **The slider moment:** drag the limit from 5% to 0.1% and watch products cascade from green to red.

---

## 2. Photosensitive Agents in Non-SPF Products

**RDFS** infers `PhotosensitiveAgent` class membership — not a label, an inferred type.
**Cypher** finds all non-Sunscreen products via BOM traversal.
**Result:** products that need an SPF pairing recommendation.

## 3. Supplier Disruption Cascade

**Cypher** traverses `Supplier ← Ingredient → BOM ← Product` for blast radius.
**n20s** validates each substitute against multi-market rules.
**Result:** which swaps are compliant, at what cost delta.

---

## 4. Allergen Reclassification

Inject **one triple**: `cosmo:Niacinamide a cosmo:Allergen`

**Cypher** finds all products containing Niacinamide via BOM.
**SHACL** fires: *"Allergens must declare maxConcentrationEU."*
**Result:** products that now need new labeling.

> **Key insight:** Cypher determines WHAT gets reasoned about. n20s determines HOW it gets reasoned about. Neither is complete without the other.

---

<!-- _class: lead -->

![width:160px](assets/logo-white.png)

# Let's See It Live

### *demo time*

---
