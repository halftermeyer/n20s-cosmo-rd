import { useState, useEffect, useCallback } from "react";
import { FilledButton, OutlinedButton, LoadingSpinner, Banner } from "@neo4j-ndl/react";
import {
  runRegulatoryChangeImpact,
  runPhotosensitiveCheck,
  runSupplierDisruption,
  validateSubstitution,
  runAllergenPropagation,
  getSuppliers,
  type RegulatoryImpact,
  type PhotosensitiveHit,
  type SupplierImpact,
  type SubstitutionValidation,
  type AllergenPropagation,
} from "../lib/scenarioQueries";
import { getIngredients, type Ingredient } from "../lib/queries";

// ─── Scenario 1: Regulatory Change Impact ──────────────────────

function RegulatoryChangeScenario() {
  const [newLimit, setNewLimit] = useState(0.03);
  const [results, setResults] = useState<RegulatoryImpact[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const impacts = await runRegulatoryChangeImpact("EU", "RetinoidAgent", newLimit);
    setResults(impacts);
    setLoading(false);
  }, [newLimit]);

  const newlyViolated = results?.filter((r) => r.status === "newly_violated") || [];
  const safe = results?.filter((r) => r.status === "safe") || [];

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <div className="scenario-number">1</div>
        <div>
          <h3>Regulatory Change Impact Analysis</h3>
          <p className="scenario-desc">
            EU announces a new Retinoid concentration limit. Which products in the EU portfolio
            are now non-compliant? Cypher traverses <code>Market &larr; Product &rarr; BOM* &rarr; Ingredient</code>,
            computes concentrations via ratio multiplication, then n20s RDFS infers which ingredients
            are RetinoidAgents (catching subclasses like Retinyl Palmitate).
          </p>
        </div>
      </div>

      <div className="scenario-controls">
        <label>
          New EU Retinoid limit:
          <input
            type="range"
            min={0.001}
            max={0.10}
            step={0.001}
            value={newLimit}
            onChange={(e) => setNewLimit(parseFloat(e.target.value))}
          />
          <span className="scenario-value">{(newLimit * 100).toFixed(1)}%</span>
        </label>
        <FilledButton size="small" onClick={run} isLoading={loading} isDisabled={loading}>
          Run Impact Analysis
        </FilledButton>
      </div>

      {results && (
        <div className="scenario-results">
          <div className="scenario-summary">
            <div className="scenario-stat fail">
              <div className="stat-number">{newlyViolated.length}</div>
              <div className="stat-label">Newly Non-Compliant</div>
            </div>
            <div className="scenario-stat safe">
              <div className="stat-number">{safe.length}</div>
              <div className="stat-label">Still Compliant</div>
            </div>
          </div>

          {newlyViolated.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Products Breaking the New Limit</h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ingredient</th>
                    <th>Actual</th>
                    <th>New Limit</th>
                    <th>Over By</th>
                  </tr>
                </thead>
                <tbody>
                  {newlyViolated.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.product}</td>
                      <td>{r.ingredient}</td>
                      <td style={{ fontFamily: "monospace" }}>{r.actualPct.toFixed(3)}%</td>
                      <td style={{ fontFamily: "monospace" }}>{r.newLimitPct.toFixed(1)}%</td>
                      <td>
                        <span className="status-fail">
                          +{(r.actualPct - r.newLimitPct).toFixed(3)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {newlyViolated.length === 0 && (
            <Banner variant="success">
              All EU products comply with the new {(newLimit * 100).toFixed(1)}% limit.
            </Banner>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Scenario 2: PhotosensitiveAgent in Non-SPF ────────────────

function PhotosensitiveScenario() {
  const [threshold, setThreshold] = useState(0.001);
  const [results, setResults] = useState<PhotosensitiveHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const hits = await runPhotosensitiveCheck(threshold);
    setResults(hits);
    setLoading(false);
  }, [threshold]);

  // Group by product
  const byProduct: Record<string, PhotosensitiveHit[]> = {};
  results?.forEach((h) => {
    if (!byProduct[h.product]) byProduct[h.product] = [];
    byProduct[h.product].push(h);
  });

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <div className="scenario-number">2</div>
        <div>
          <h3>Photosensitive Agents in Non-SPF Products</h3>
          <p className="scenario-desc">
            RDFS infers that Retinol and Retinal are <code>PhotosensitiveAgent</code> via the class hierarchy
            (not a label — an inferred RDF type). Cypher traverses all non-Sunscreen products through
            their multi-level BOMs. The combination catches products that need an SPF pairing recommendation.
          </p>
        </div>
      </div>

      <div className="scenario-controls">
        <label>
          Concentration threshold:
          <input
            type="range"
            min={0.0001}
            max={0.01}
            step={0.0001}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
          <span className="scenario-value">{(threshold * 100).toFixed(2)}%</span>
        </label>
        <FilledButton size="small" onClick={run} isLoading={loading} isDisabled={loading}>
          Scan Portfolio
        </FilledButton>
      </div>

      {results && (
        <div className="scenario-results">
          <div className="scenario-summary">
            <div className="scenario-stat warn">
              <div className="stat-number">{Object.keys(byProduct).length}</div>
              <div className="stat-label">Products Flagged</div>
            </div>
            <div className="scenario-stat">
              <div className="stat-number">{results.length}</div>
              <div className="stat-label">Total Hits</div>
            </div>
          </div>

          {Object.entries(byProduct).map(([product, hits]) => (
            <div key={product} style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {product}
                <span className="chip" style={{ marginLeft: 8 }}>{hits[0].productType}</span>
                <span className="status-warn" style={{ marginLeft: 8 }}>Recommend SPF pairing</span>
              </div>
              {hits.map((h, i) => (
                <div key={i} style={{ marginLeft: 24, fontSize: 13, marginBottom: 2 }}>
                  <strong>{h.ingredient}</strong> at {h.concentrationPct.toFixed(3)}%
                  <span style={{ color: "#999", marginLeft: 8 }}>
                    (inferred: {h.inferredClasses.join(", ")})
                  </span>
                </div>
              ))}
            </div>
          ))}

          {results.length === 0 && (
            <Banner variant="success">
              No photosensitive agents above {(threshold * 100).toFixed(2)}% in non-SPF products.
            </Banner>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Scenario 3: Supplier Disruption Cascade ───────────────────

function SupplierDisruptionScenario() {
  const [suppliers, setSuppliers] = useState<{ name: string; country: string; ingredientCount: number }[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [impacts, setImpacts] = useState<SupplierImpact[] | null>(null);
  const [supplierInfo, setSupplierInfo] = useState<{ name: string; country: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [subValidations, setSubValidations] = useState<SubstitutionValidation[]>([]);
  const [loadingSub, setLoadingSub] = useState<string | null>(null);

  useEffect(() => {
    getSuppliers().then(setSuppliers);
  }, []);

  const run = useCallback(async () => {
    if (!selectedSupplier) return;
    setLoading(true);
    setSubValidations([]);
    const result = await runSupplierDisruption(selectedSupplier);
    setSupplierInfo(result.supplier);
    setImpacts(result.impacts);
    setLoading(false);
  }, [selectedSupplier]);

  const runAllSubValidations = useCallback(async (original: string, substitutes: { name: string }[]) => {
    setLoadingSub(original);
    const products = await (await import("../lib/queries")).getProducts();
    const affectedProducts = impacts?.find((i) => i.ingredient === original)?.affectedProducts || [];
    const prod = products.find((p) => affectedProducts.includes(p.name));
    if (prod) {
      const results: SubstitutionValidation[] = [];
      for (const sub of substitutes) {
        const result = await validateSubstitution(prod.sku, original, sub.name);
        results.push(result);
      }
      setSubValidations(results);
    }
    setLoadingSub(null);
  }, [impacts]);

  const totalAffectedProducts = new Set(
    impacts?.flatMap((i) => i.affectedProducts) || []
  ).size;

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <div className="scenario-number">3</div>
        <div>
          <h3>Supplier Disruption Cascade</h3>
          <p className="scenario-desc">
            A supplier is blocked. Cypher traverses <code>Supplier &larr; Ingredient &rarr; BOM* &larr; Product</code> to
            find the blast radius. Then for each affected ingredient, finds <code>SUBSTITUTE_FOR</code> alternatives.
            n20s validates the substituted formulation against all market limits.
          </p>
        </div>
      </div>

      <div className="scenario-controls">
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ccc", fontSize: 14 }}
        >
          <option value="">Select a supplier to disrupt...</option>
          {suppliers.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.country}) — {s.ingredientCount} ingredients
            </option>
          ))}
        </select>
        <FilledButton size="small" onClick={run} isLoading={loading} isDisabled={loading || !selectedSupplier}>
          Simulate Disruption
        </FilledButton>
      </div>

      {impacts && supplierInfo && (
        <div className="scenario-results">
          <div className="scenario-summary">
            <div className="scenario-stat fail">
              <div className="stat-number">{impacts.length}</div>
              <div className="stat-label">Ingredients Affected</div>
            </div>
            <div className="scenario-stat warn">
              <div className="stat-number">{totalAffectedProducts}</div>
              <div className="stat-label">Products at Risk</div>
            </div>
            <div className="scenario-stat safe">
              <div className="stat-number">
                {impacts.filter((i) => i.substitutes.length > 0).length}
              </div>
              <div className="stat-label">Have Substitutes</div>
            </div>
          </div>

          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Category</th>
                <th>Affected Products</th>
                <th>Substitutes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {impacts.map((imp) => (
                <tr key={imp.ingredient}>
                  <td style={{ fontWeight: 600 }}>{imp.ingredient}</td>
                  <td><span className="chip">{imp.category}</span></td>
                  <td>
                    {imp.affectedProducts.length > 0
                      ? imp.affectedProducts.slice(0, 3).join(", ") +
                        (imp.affectedProducts.length > 3
                          ? ` +${imp.affectedProducts.length - 3} more`
                          : "")
                      : <span style={{ color: "#999" }}>None</span>}
                  </td>
                  <td>
                    {imp.substitutes.length > 0
                      ? imp.substitutes.map((s) => (
                          <span key={s.name} className="chip" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                            {s.name}
                          </span>
                        ))
                      : <span className="status-fail">No substitute</span>}
                  </td>
                  <td>
                    {imp.substitutes.length > 0 && imp.affectedProducts.length > 0 && (
                      <OutlinedButton
                        size="small"
                        onClick={() => runAllSubValidations(
                          imp.ingredient,
                          imp.substitutes
                        )}
                        isLoading={loadingSub === imp.ingredient}
                        isDisabled={loadingSub !== null}
                      >
                        Validate All Swaps
                      </OutlinedButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {subValidations.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>
                Substitution Validation: {subValidations[0].original} in {subValidations[0].product}
              </h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Substitute</th>
                    <th>Status</th>
                    <th>Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {subValidations.map((sv) => (
                    <tr key={sv.substitute}>
                      <td style={{ fontWeight: 600 }}>{sv.substitute}</td>
                      <td>
                        <span className={sv.status === "pass" ? "status-pass" : "status-fail"}>
                          {sv.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {sv.violations.length > 0
                          ? sv.violations.map((v, i) => (
                              <span key={i} className="status-fail" style={{ marginRight: 6 }}>
                                {v.market}: {(Number(v.actual) * 100).toFixed(2)}% &gt; {(Number(v.limit) * 100).toFixed(2)}%
                              </span>
                            ))
                          : <span style={{ color: "#2e7d32" }}>All markets clear</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Scenario 4: Allergen Propagation ──────────────────────────

function AllergenPropagationScenario() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<AllergenPropagation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getIngredients().then((ings) => {
      // Filter to ingredients that are NOT already allergens
      const nonAllergens = ings.filter(
        (i) => !i.turtle.includes("Allergen")
      );
      setIngredients(nonAllergens);
    });
  }, []);

  const run = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    const r = await runAllergenPropagation(selected);
    setResult(r);
    setLoading(false);
  }, [selected]);

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <div className="scenario-number">4</div>
        <div>
          <h3>Allergen Reclassification Propagation</h3>
          <p className="scenario-desc">
            An ingredient is reclassified as <code>Allergen</code> in the ontology. RDFS propagates
            the classification. Cypher traverses all products containing it through multi-level BOMs.
            SHACL validates: allergens must declare <code>maxConcentrationEU</code>. Products that
            previously didn't need allergen labeling now fail validation.
          </p>
        </div>
      </div>

      <div className="scenario-controls">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ccc", fontSize: 14, maxWidth: 300 }}
        >
          <option value="">Select an ingredient to reclassify as Allergen...</option>
          {ingredients.map((i) => (
            <option key={i.name} value={i.name}>{i.name} ({i.category})</option>
          ))}
        </select>
        <FilledButton size="small" onClick={run} isLoading={loading} isDisabled={loading || !selected}>
          Simulate Reclassification
        </FilledButton>
      </div>

      {result && (
        <div className="scenario-results">
          <div className="scenario-summary">
            <div className="scenario-stat warn">
              <div className="stat-number">{result.affectedProducts.length}</div>
              <div className="stat-label">Products Affected</div>
            </div>
            <div className="scenario-stat fail">
              <div className="stat-number">{result.shaclViolations.length}</div>
              <div className="stat-label">SHACL Violations</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h4>Updated RDF Classification (RDFS-inferred)</h4>
            <div>
              {result.currentClasses.map((cls) => (
                <span
                  key={cls}
                  className="chip"
                  style={cls === "Allergen" ? { background: "#ffebee", color: "#c62828", fontWeight: 600 } : {}}
                >
                  cosmo:{cls}
                </span>
              ))}
            </div>
          </div>

          {result.affectedProducts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Affected Products (via BOM traversal)</h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Concentration</th>
                    <th>Markets</th>
                  </tr>
                </thead>
                <tbody>
                  {result.affectedProducts.map((p) => (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ fontFamily: "monospace" }}>{p.concentrationPct.toFixed(3)}%</td>
                      <td>{p.markets.map((m) => <span key={m} className="chip">{m}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.shaclViolations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>SHACL Violations (new labeling requirements)</h4>
              {result.shaclViolations.map((v, i) => (
                <div key={i} className="card" style={{ background: "#fff3f3", borderColor: "#ffcdd2" }}>
                  <strong>{v.focusNode}</strong>: {v.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Scenarios Tab ────────────────────────────────────────

export default function ScenariosTab() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: "#0b297d" }}>
          Graph Traversal &rarr; RDF Reasoning Scenarios
        </h2>
        <p style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
          Each scenario demonstrates Cypher deep traversal scoping a triple set for n20s RDF-based reasoning.
          Neither Cypher alone nor RDF alone can answer these questions.
        </p>
      </div>

      <RegulatoryChangeScenario />
      <PhotosensitiveScenario />
      <SupplierDisruptionScenario />
      <AllergenPropagationScenario />
    </div>
  );
}
