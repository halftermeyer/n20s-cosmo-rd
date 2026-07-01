# n20s Cosmetics R&D Demo — Walkthrough Script

## Prerequisites

```bash
# 1. Load the data
python generate_data.py
cat data/load_data.cypher | cypher-shell -u neo4j -p '<password>' -a bolt://127.0.0.1:7687

# 2. Start the React app
cd app
cp .env.example .env   # edit with your credentials
npm install
npm run dev             # opens http://localhost:5173
```

Create `app/.env`:
```
VITE_NEO4J_URI=bolt://127.0.0.1:7687
VITE_NEO4J_USER=neo4j
VITE_NEO4J_PASSWORD=<your-password>
VITE_GEMINI_API_KEY=<your-key>
```

---

## The Story

You're an R&D formulation scientist at a cosmetics company. You have 153 ingredients, 36 products, and you need to:
1. Understand your ingredient portfolio
2. Design a new anti-aging serum
3. Check it passes EU/US/China/Japan regulations
4. React when regulations change or supply chains break

The demo shows why you need **both** graph traversal (Cypher) **and** semantic reasoning (RDF/RDFS/SHACL) — neither alone can answer these questions.

---

## Act 1: Explore — Know Your Portfolio

> **Tab: Explore**

### 1.1 — Ingredient portfolio

Show the ingredient chips grouped by category. Point out the count (153 ingredients, 16 categories).

**Talking point:** *"Every ingredient carries an RDF Turtle property with its real INCI classification and regulation limits. The graph stores LPG structure — BOMs, suppliers, markets — and RDF knowledge — ontology classes, concentration limits."*

### 1.2 — Click an ingredient: Retinol

Click the **Retinol** chip. The right panel shows:
- INCI name, CAS number, cost
- **RDF Classification (RDFS inference)** — n20s loads the ingredient turtle + ontology, runs RDFS backward chaining, returns inferred classes: `RetinoidAgent`, `PhotosensitiveAgent`, `VitaminADerivative`
- **Regulation Limits** — EU: 5.00%, China: 50.00%, Japan: 25.00%

**Talking point:** *"Retinol doesn't have a 'PhotosensitiveAgent' label in the LPG. That's an inferred class — RDFS walks the ontology's subClassOf hierarchy. This matters when we need to find ALL photosensitive ingredients, not just the ones someone remembered to tag."*

### 1.3 — Product BOM

Click **Anti-Aging Serum V1** in the product list. The bar chart shows concentrations computed by Cypher's `reduce` over the multi-level BOM path (Product → Phase → PreMix → Ingredient), multiplying ratios at each level.

**Talking point:** *"This is pure Cypher — variable-length path traversal with ratio multiplication. The BOM tree can be 3 levels deep. The final concentration of Retinol is 0.08%, computed by multiplying 3 ratios along the path."*

---

## Act 2: Formulate — Design a New Serum

> **Tab: Formulate**

### 2.1 — Pick ingredients

The template has 7 functional slots. Select:
- **Humectant:** Hyaluronic Acid
- **Emollient:** Squalane
- **Retinoid Active:** Retinol
- **Antioxidant:** Tocopherol
- **Preservative:** Phenoxyethanol
- **Vitamin Derivative:** Niacinamide
- **Peptide:** Matrixyl

### 2.2 — Incompatibility check

Now change **Antioxidant** to **Ascorbic Acid**. The row flashes red — **CONFLICT** — because Retinol and Ascorbic Acid are `INCOMPATIBLE_WITH` in the graph.

**Talking point:** *"This is a real-time Cypher check — the app queries `INCOMPATIBLE_WITH` relationships whenever you change a selection. In real cosmetic chemistry, Retinol + Vitamin C at low pH causes irritation and degrades both actives."*

Switch back to **Tocopherol** (compatible — they're even `COMPATIBLE_WITH`).

### 2.3 — Adjust concentrations

Drag the **Retinoid Active** slider. Note the water percentage auto-balances. Leave Retinol at a reasonable 0.5%.

### 2.4 — Lock the formulation

Click **Lock Formulation & Prepare Validation**. The candidate summary appears at the bottom.

---

## Act 3: Validate — Multi-Market Compliance

> **Tab: Validate**

### 3.1 — Run compliance check

Click **Run n20s Compliance Check**. This fires:
1. `addTurtle` — loads each ingredient's RDF into n20s
2. `addTurtle` — injects actual concentrations as `xsd:double` triples
3. `addTurtle` — loads the ontology for RDFS class inference
4. `queryWithRules` — fires 4 Jena rules (one per market) using `greaterThan` builtins
5. `validate` — runs SHACL shapes

Result: **ALL CLEAR** — the formulation passes all markets.

**Open the Cypher audit drawer** (dark tab on the right edge). Show the exact queries that ran. Every step is reproducible in cypher-shell.

### 3.2 — Make it fail

Go back to **Formulate**. Drag **Retinoid Active** (Retinol) up to **6%**. Lock again. Go to **Validate**, run check.

**Result:** EU column goes **FAIL (5.0%)** — Retinol at 6% exceeds the 5% EU limit. US/China/Japan show "--" (no limit for Retinol in those markets) or PASS.

**Talking point:** *"The `greaterThan` builtin in the Jena rule compares `xsd:double` values — actual concentration vs. regulatory limit. RDFS inference is layered on top, so if we had a new RetinoidAgent subclass, it would automatically be caught by the same rule."*

### 3.3 — Non-EU failure

Go back. Set **Retinoid Active** to 0.5% (safe for EU). Now change **Preservative** to **Phenoxyethanol** at **1.5%**. Lock and validate.

**Result:** EU **FAIL (1.0%)**, US **FAIL (1.0%)**, China **FAIL (1.0%)**, Japan **FAIL (1.0%)** — Phenoxyethanol is regulated at 1% in all 4 markets.

### 3.4 — Export for audit

Click **Export Turtle for Audit**. The fully RDFS-inferred graph is serialized as Turtle — ready for regulatory submission.

---

## Act 4: Scenarios — Graph Traversal Scopes RDF Reasoning

> **Tab: Scenarios**

This is the core value proposition: **Cypher deep traversal defines WHAT gets reasoned about, n20s determines HOW.**

### 4.1 — Regulatory Change Impact

*"EU just announced a new Retinoid limit."*

Drag the slider to **0.1%** (from the default 3%). Click **Run Impact Analysis**.

**Result:** Products containing retinoids above 0.1% are flagged as "Newly Non-Compliant."

**Talking point:** *"Cypher traverses `Market(EU) ← SOLD_IN ← Product → CONTAINS* → Ingredient`, multiplies ratios along the BOM to compute actual concentrations, then compares against the new limit. Neither pure Cypher (can't do RDFS class inference to catch all RetinoidAgent subclasses) nor pure RDF (can't walk a multi-level BOM and multiply ratios) can answer this alone."*

### 4.2 — Photosensitive Agents in Non-SPF Products

Click **Scan Portfolio**.

**Result:** Products of type Serum/Cream/Peel containing Retinol or Retinal (inferred as `PhotosensitiveAgent` via RDFS) are flagged with "Recommend SPF pairing."

**Talking point:** *"`PhotosensitiveAgent` is NOT a label in the LPG — it's an inferred RDF class. Cypher finds the products and computes concentrations. n20s RDFS infers which ingredients are photosensitive. The combination catches what neither could alone."*

### 4.3 — Supplier Disruption Cascade

Select a supplier (e.g., one with many ingredients). Click **Simulate Disruption**.

**Result:** Shows affected ingredients, impacted products, available substitutes.

Click **Validate All Swaps** on an ingredient with substitutes (e.g., Retinol → Bakuchiol/Moth Bean/Rambutan).

**Result:** Table shows PASS/FAIL per substitute — some may introduce new regulatory violations.

**Talking point:** *"The blast radius is pure graph traversal: `Supplier ← SUPPLIED_BY ← Ingredient → CONTAINS* ← Product`. The compliance validation is n20s: load the substituted BOM's ingredient turtles, fire market-specific rules. Two-step pipeline."*

### 4.4 — Allergen Reclassification

Select an ingredient that is NOT currently an allergen (e.g., **Niacinamide**). Click **Simulate Reclassification**.

**Result:**
- RDF classes now include `Allergen` (injected via `addTurtle`)
- Affected products listed with concentrations and markets
- SHACL violation: *"EU regulation: Allergens must declare maxConcentrationEU for labeling compliance"* — because Niacinamide doesn't have an EU limit declared

**Talking point:** *"We injected ONE triple — `cosmo:Niacinamide a cosmo:Allergen`. SHACL immediately catches that this new allergen lacks the required EU limit declaration. The products affected were found by Cypher BOM traversal. The labeling requirement was enforced by SHACL. Neither could do this alone."*

---

## Act 5: Assistant — Natural Language Interface

> **Tab: Assistant**

### 5.1 — Classification query
```
What retinoid ingredients do we have and what are their EU limits?
```
Shows ingredients with limits, plus the Cypher audit trail.

### 5.2 — Incompatibility check
```
Can I combine Retinol with Glycolic Acid?
```
Answer: **No** — they're incompatible. Shows the Cypher query.

### 5.3 — BOM analysis
```
Show me the BOM for Anti-Aging Serum V1
```
Returns the full concentration breakdown.

### 5.4 — Multi-market validation (the money shot)
```
Validate a serum with Glycolic Acid at 0.08, Hyaluronic Acid at 0.04, and Phenoxyethanol at 0.008
```
**Result:** Glycolic Acid at 8% passes EU (limit 10%) but **fails China** (limit 6%). Shows the full n20s pipeline in the audit trail: `addTurtle` → concentration injection → `queryWithRules` with `greaterThan` → per-market results.

### 5.5 — Cross-market arbitrage
```
Validate a serum with Avobenzone at 0.04, Squalane at 0.15, and Glycerin at 0.05
```
**Result:** Avobenzone at 4% passes EU (limit 5%) but **fails US** (limit 3%).

**Talking point:** *"The chatbot uses Gemini with function calling. Each tool maps to the same Neo4j queries the UI uses. The Cypher audit trail is included in every response — full transparency, full reproducibility."*

---

## Wrap-Up — Why This Matters

Two capabilities working together:

| Layer | What it does | Can't do alone |
|-------|-------------|---------------|
| **Cypher** | BOM traversal, ratio multiplication, incompatibility checks, supplier blast radius | Can't do RDFS class inference or SHACL validation |
| **n20s** | RDFS backward/forward chaining, Jena rules with builtins, SHACL validation, Turtle export | Can't traverse LPG paths or compute BOM concentrations |

The demo shows: **the graph structure (LPG) determines the SCOPE of reasoning, and the RDF layer (n20s) determines the LOGIC of reasoning.** Neither is complete without the other.
