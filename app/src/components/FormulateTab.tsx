import { useState, useEffect, useCallback } from "react";
import { FilledButton, OutlinedButton, LoadingSpinner, Banner, Select } from "@neo4j-ndl/react";
import {
  getCategories,
  getIngredientsByCategory,
  checkIncompatibility,
  validateCandidate,
  exportTurtle,
  type Ingredient,
  type IncompatibilityPair,
  type Violation,
  type SHACLResult,
} from "../lib/queries";

// Slots with preferred defaults for demo — chosen to trigger multi-market scenarios
const TEMPLATE_SLOTS = [
  { category: "Humectant", label: "Humectant", defaultConc: 0.04, min: 0.01, max: 0.15, preferredIngredient: "Hyaluronic Acid" },
  { category: "Emollient", label: "Emollient", defaultConc: 0.15, min: 0.05, max: 0.30, preferredIngredient: "Squalane" },
  { category: "RetinoidAgent", label: "Retinoid Active", defaultConc: 0.005, min: 0.001, max: 0.15, preferredIngredient: "Retinol" },
  { category: "Antioxidant", label: "Antioxidant", defaultConc: 0.02, min: 0.005, max: 0.10, preferredIngredient: "Tocopherol" },
  { category: "Preservative", label: "Preservative", defaultConc: 0.008, min: 0.001, max: 0.03, preferredIngredient: "Phenoxyethanol" },
  { category: "VitaminDerivative", label: "Vitamin Derivative", defaultConc: 0.02, min: 0.005, max: 0.10, preferredIngredient: "Niacinamide" },
  { category: "Peptide", label: "Peptide", defaultConc: 0.01, min: 0.001, max: 0.05, preferredIngredient: "Matrixyl" },
  { category: "AHAExfoliant", label: "AHA Exfoliant", defaultConc: 0.05, min: 0.005, max: 0.12, preferredIngredient: "Glycolic Acid" },
  { category: "UVFilter", label: "UV Filter", defaultConc: 0.03, min: 0.005, max: 0.15, preferredIngredient: "Avobenzone" },
];

const MARKETS = ["EU", "US", "China", "Japan"];

export default function FormulateTab() {
  const [categories, setCategories] = useState<string[]>([]);
  const [ingredientsBySlot, setIngredientsBySlot] = useState<Record<string, Ingredient[]>>({});
  const [selections, setSelections] = useState<
    Record<number, { ingredient: Ingredient | null; concentration: number }>
  >({});
  const [incompatibilities, setIncompatibilities] = useState<IncompatibilityPair[]>([]);
  const [loading, setLoading] = useState(true);

  // Validation state
  const [violations, setViolations] = useState<Violation[]>([]);
  const [shacl, setShacl] = useState<SHACLResult[]>([]);
  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [turtle, setTurtle] = useState<string | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const neededCats = TEMPLATE_SLOTS.map((s) => s.category);
    const uniqueCats = [...new Set(neededCats)];
    Promise.all(
      uniqueCats.map((cat) =>
        getIngredientsByCategory(cat).then((ings) => ({ cat, ings }))
      )
    ).then((results) => {
      const map: Record<string, Ingredient[]> = {};
      results.forEach(({ cat, ings }) => {
        map[cat] = ings.filter((i) => i.name !== "Water");
      });
      setIngredientsBySlot(map);
    });
  }, [categories]);

  useEffect(() => {
    if (Object.keys(ingredientsBySlot).length === 0) return;
    const initial: Record<number, { ingredient: Ingredient | null; concentration: number }> = {};
    TEMPLATE_SLOTS.forEach((slot, idx) => {
      const ings = ingredientsBySlot[slot.category] || [];
      const preferred = slot.preferredIngredient
        ? ings.find((i) => i.name === slot.preferredIngredient)
        : null;
      initial[idx] = {
        ingredient: preferred || ings[0] || null,
        concentration: slot.defaultConc,
      };
    });
    setSelections(initial);
  }, [ingredientsBySlot]);

  // Check incompatibilities whenever selections change
  useEffect(() => {
    const names = Object.values(selections)
      .filter((s) => s.ingredient)
      .map((s) => s.ingredient!.name);
    if (names.length < 2) {
      setIncompatibilities([]);
      return;
    }
    checkIncompatibility(names).then(setIncompatibilities);
  }, [selections]);

  // Reset validation when formulation changes
  useEffect(() => {
    setValidated(false);
    setViolations([]);
    setShacl([]);
    setTurtle(null);
  }, [selections]);

  const handleIngredientChange = (slotIdx: number, name: string) => {
    const slot = TEMPLATE_SLOTS[slotIdx];
    const ings = ingredientsBySlot[slot.category] || [];
    const ing = ings.find((i) => i.name === name) || null;
    setSelections((prev) => ({
      ...prev,
      [slotIdx]: { ...prev[slotIdx], ingredient: ing },
    }));
  };

  const handleConcentrationChange = (slotIdx: number, value: number) => {
    setSelections((prev) => ({
      ...prev,
      [slotIdx]: { ...prev[slotIdx], concentration: value },
    }));
  };

  // Build candidate from current selections
  const buildCandidate = useCallback(() => {
    return Object.entries(selections)
      .filter(([, s]) => s.ingredient)
      .map(([idx, s]) => ({
        name: s.ingredient!.name,
        concentration: s.concentration,
        category: TEMPLATE_SLOTS[parseInt(idx)].category,
      }));
  }, [selections]);

  // Run validation
  const runValidation = useCallback(async () => {
    const candidate = buildCandidate();
    if (candidate.length === 0) return;
    setValidating(true);
    setValidated(false);
    setTurtle(null);
    try {
      const result = await validateCandidate(candidate);
      setViolations(result.violations);
      setShacl(result.shacl);
      setValidated(true);
    } catch (e: unknown) {
      setShacl([{ focusNode: "error", severity: "Error", message: (e as Error).message }]);
      setValidated(true);
    }
    setValidating(false);
  }, [buildCandidate]);

  // Export turtle
  const runExport = useCallback(async () => {
    const candidate = buildCandidate();
    if (candidate.length === 0) return;
    setLoadingExport(true);
    try {
      const t = await exportTurtle(candidate);
      setTurtle(t);
    } catch (e: unknown) {
      setTurtle(`Error: ${(e as Error).message}`);
    }
    setLoadingExport(false);
  }, [buildCandidate]);

  if (loading) {
    return (
      <div className="loading-container">
        <LoadingSpinner size="large" />
        Loading categories...
      </div>
    );
  }

  const totalActive = Object.values(selections).reduce(
    (sum, s) => sum + (s.ingredient ? s.concentration : 0),
    0
  );
  const waterPct = Math.max(0, (1 - totalActive) * 100);

  const incompatibleNames = new Set<string>();
  incompatibilities.forEach((p) => {
    incompatibleNames.add(p.a);
    incompatibleNames.add(p.b);
  });

  const candidate = buildCandidate();

  // Compliance matrix helper
  const getMarketStatus = (
    ingredientName: string
  ): Record<string, { status: "pass" | "fail" | "na"; limit?: number }> => {
    const statuses: Record<string, { status: "pass" | "fail" | "na"; limit?: number }> = {};
    MARKETS.forEach((market) => {
      const violation = violations.find(
        (v) => v.label === ingredientName && v.market === market
      );
      if (violation) {
        statuses[market] = { status: "fail", limit: Number(violation.limit) };
      } else {
        statuses[market] = { status: validated ? "pass" : "na" };
      }
    });
    return statuses;
  };

  return (
    <div>
      {/* ── Formulation ─────────────────────────────────────── */}
      <div className="card">
        <h3>Anti-Aging Day Serum — Formulation Template</h3>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          Select an ingredient for each functional slot and adjust concentrations.
          Incompatibilities are checked in real time.
        </p>

        {TEMPLATE_SLOTS.map((slot, idx) => {
          const ings = ingredientsBySlot[slot.category] || [];
          const sel = selections[idx];
          if (!sel) return null;

          const isIncompatible = sel.ingredient && incompatibleNames.has(sel.ingredient.name);

          return (
            <div
              key={idx}
              className="slider-row"
              style={{
                background: isIncompatible ? "#fff3f3" : undefined,
                padding: "8px 12px",
                borderRadius: 4,
              }}
            >
              <label>
                {slot.label}
                {isIncompatible && (
                  <span style={{ color: "#c62828", marginLeft: 8, fontSize: 12 }}>
                    CONFLICT
                  </span>
                )}
              </label>

              <div style={{ width: 200 }}>
                <Select
                  size="small"
                  type="select"
                  selectProps={{
                    value: sel.ingredient
                      ? { label: sel.ingredient.name, value: sel.ingredient.name }
                      : null,
                    options: ings.map((i) => ({ label: i.name, value: i.name })),
                    onChange: (opt: { value: string } | null) => {
                      if (opt) handleIngredientChange(idx, opt.value);
                    },
                    menuPortalTarget: document.body,
                  }}
                />
              </div>

              <input
                type="range"
                min={slot.min}
                max={slot.max}
                step={0.001}
                value={sel.concentration}
                onChange={(e) =>
                  handleConcentrationChange(idx, parseFloat(e.target.value))
                }
              />

              <span className="value">
                {(sel.concentration * 100).toFixed(2)}%
              </span>
            </div>
          );
        })}

        {/* Water balance */}
        <div className="slider-row" style={{ background: "#f0f7ff", padding: "8px 12px", borderRadius: 4 }}>
          <label style={{ fontWeight: 600 }}>Water (balance)</label>
          <div style={{ flex: 1 }} />
          <span className="value" style={{ fontWeight: 600 }}>
            {waterPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Incompatibility pairings */}
      {incompatibilities.length > 0 && (
        <div className="card" style={{ borderColor: "#ffcdd2", background: "#fff8f8" }}>
          <h3 style={{ color: "#c62828" }}>
            Incompatibilities Detected ({incompatibilities.length})
          </h3>
          <div className="incompat-pairings">
            {incompatibilities.map((p, i) => (
              <div key={i} className="incompat-pair">
                <span className="incompat-chip">{p.a}</span>
                <svg className="incompat-line" width="60" height="24" viewBox="0 0 60 24">
                  <line x1="0" y1="12" x2="60" y2="12" stroke="#c62828" strokeWidth="2" strokeDasharray="4 3" />
                  <circle cx="6" cy="12" r="4" fill="#c62828" />
                  <circle cx="54" cy="12" r="4" fill="#c62828" />
                  <text x="30" y="9" textAnchor="middle" fill="#c62828" fontSize="14" fontWeight="bold">&#x2717;</text>
                </svg>
                <span className="incompat-chip">{p.b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Validation ──────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Multi-Market Compliance Check</h3>
        <div className="button-group">
          <FilledButton
            size="medium"
            onClick={runValidation}
            isLoading={validating}
            isDisabled={validating || candidate.length === 0}
          >
            Run n20s Compliance Check
          </FilledButton>
          <OutlinedButton
            size="medium"
            onClick={runExport}
            isLoading={loadingExport}
            isDisabled={loadingExport || !validated}
          >
            Export Turtle for Audit
          </OutlinedButton>
        </div>
      </div>

      {validating && (
        <div className="loading-container">
          <LoadingSpinner size="large" />
          Running RDFS inference + Jena rules + SHACL validation...
        </div>
      )}

      {validated && (
        <>
          {/* Compliance matrix */}
          <div className="card">
            <h3>
              Compliance Matrix{" "}
              {violations.length === 0 ? (
                <span className="status-pass">ALL CLEAR</span>
              ) : (
                <span className="status-fail">
                  {violations.length} VIOLATION{violations.length > 1 ? "S" : ""}
                </span>
              )}
            </h3>

            <div className="compliance-matrix">
              <div className="header">Ingredient</div>
              {MARKETS.map((m) => (
                <div key={m} className="header">{m}</div>
              ))}

              {candidate.map((c) => {
                const statuses = getMarketStatus(c.name);
                return [
                  <div key={`${c.name}-name`} className="ingredient-name">
                    {c.name}
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#999", fontFamily: "monospace" }}>
                      {(c.concentration * 100).toFixed(2)}%
                    </span>
                  </div>,
                  ...MARKETS.map((m) => {
                    const s = statuses[m];
                    return (
                      <div key={`${c.name}-${m}`} className={`cell ${s.status}`}>
                        {s.status === "pass"
                          ? "PASS"
                          : s.status === "fail"
                          ? `FAIL (${(s.limit! * 100).toFixed(1)}%)`
                          : "--"}
                      </div>
                    );
                  }),
                ];
              })}
            </div>
          </div>

          {/* Violations detail */}
          {violations.length > 0 && (
            <div className="card">
              <h3>Concentration Limit Violations (queryWithRules + greaterThan)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Market</th>
                    <th>Actual</th>
                    <th>Limit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{v.label}</td>
                      <td><span className="chip">{v.market}</span></td>
                      <td style={{ fontFamily: "monospace" }}>{(Number(v.actual) * 100).toFixed(2)}%</td>
                      <td style={{ fontFamily: "monospace" }}>{(Number(v.limit) * 100).toFixed(2)}%</td>
                      <td><span className="status-fail">EXCEEDS LIMIT</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SHACL results */}
          {shacl.length > 0 && (
            <div className="card">
              <h3>SHACL Validation Results</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Focus Node</th><th>Severity</th><th>Message</th></tr>
                </thead>
                <tbody>
                  {shacl.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {s.focusNode.replace("http://example.org/cosmo#", "cosmo:")}
                      </td>
                      <td>
                        <span className={s.severity === "Violation" ? "status-fail" : "status-warn"}>
                          {s.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{s.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {violations.length === 0 && shacl.length === 0 && (
            <Banner variant="success">
              <strong>Formulation Passed All Checks.</strong> No concentration limit violations. No SHACL constraint violations.
            </Banner>
          )}
        </>
      )}

      {/* Turtle export */}
      {turtle && (
        <div className="card">
          <h3>
            Turtle Export (RDFS-inferred)
            <OutlinedButton
              size="small"
              onClick={() => navigator.clipboard.writeText(turtle)}
            >
              Copy
            </OutlinedButton>
          </h3>
          <div className="turtle-export">{turtle}</div>
        </div>
      )}
    </div>
  );
}
