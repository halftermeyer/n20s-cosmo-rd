import { useState, useEffect, useCallback } from "react";
import { FilledButton, LoadingSpinner, Banner, Select } from "@neo4j-ndl/react";
import {
  getCategories,
  getIngredientsByCategory,
  checkIncompatibility,
  type Ingredient,
  type IncompatibilityPair,
} from "../lib/queries";

interface CandidateEntry {
  name: string;
  concentration: number;
  category: string;
}

interface Props {
  candidate: CandidateEntry[];
  setCandidate: (c: CandidateEntry[]) => void;
}

// Functional slots for an anti-aging serum template
const TEMPLATE_SLOTS = [
  { category: "Humectant", label: "Humectant", defaultConc: 0.04, min: 0.01, max: 0.15 },
  { category: "Emollient", label: "Emollient", defaultConc: 0.15, min: 0.05, max: 0.30 },
  { category: "RetinoidAgent", label: "Retinoid Active", defaultConc: 0.005, min: 0.001, max: 0.15 },
  { category: "Antioxidant", label: "Antioxidant", defaultConc: 0.02, min: 0.005, max: 0.10 },
  { category: "Preservative", label: "Preservative", defaultConc: 0.008, min: 0.001, max: 0.03 },
  { category: "VitaminDerivative", label: "Vitamin Derivative", defaultConc: 0.02, min: 0.005, max: 0.10 },
  { category: "Peptide", label: "Peptide", defaultConc: 0.01, min: 0.001, max: 0.05 },
];

export default function FormulateTab({ candidate, setCandidate }: Props) {
  const [categories, setCategories] = useState<string[]>([]);
  const [ingredientsBySlot, setIngredientsBySlot] = useState<
    Record<string, Ingredient[]>
  >({});
  const [selections, setSelections] = useState<
    Record<number, { ingredient: Ingredient | null; concentration: number }>
  >({});
  const [incompatibilities, setIncompatibilities] = useState<IncompatibilityPair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  // Load ingredients for each template slot
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

  // Initialize selections with defaults
  useEffect(() => {
    if (Object.keys(ingredientsBySlot).length === 0) return;
    const initial: Record<number, { ingredient: Ingredient | null; concentration: number }> = {};
    TEMPLATE_SLOTS.forEach((slot, idx) => {
      const ings = ingredientsBySlot[slot.category] || [];
      initial[idx] = {
        ingredient: ings[0] || null,
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

  // Sync candidate state
  const buildCandidate = useCallback(() => {
    const entries: CandidateEntry[] = Object.entries(selections)
      .filter(([, s]) => s.ingredient)
      .map(([idx, s]) => ({
        name: s.ingredient!.name,
        concentration: s.concentration,
        category: TEMPLATE_SLOTS[parseInt(idx)].category,
      }));
    setCandidate(entries);
  }, [selections, setCandidate]);

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

  if (loading) {
    return (
      <div className="loading-container">
        <LoadingSpinner size="large" />
        Loading categories...
      </div>
    );
  }

  // Compute water percentage
  const totalActive = Object.values(selections).reduce(
    (sum, s) => sum + (s.ingredient ? s.concentration : 0),
    0
  );
  const waterPct = Math.max(0, (1 - totalActive) * 100);

  // Check which ingredients are involved in incompatibilities
  const incompatibleNames = new Set<string>();
  incompatibilities.forEach((p) => {
    incompatibleNames.add(p.a);
    incompatibleNames.add(p.b);
  });

  return (
    <div>
      {/* Template selector */}
      <div className="card">
        <h3>Anti-Aging Serum Formulation Template</h3>
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

      {/* Incompatibility warnings */}
      {incompatibilities.length > 0 && (
        <Banner variant="warning">
          <strong>Incompatibilities Detected: </strong>
          {incompatibilities.map((p) => `${p.a} + ${p.b}`).join(" | ")}
        </Banner>
      )}

      {/* Build candidate button */}
      <div className="button-group" style={{ justifyContent: "center", margin: "16px 0" }}>
        <FilledButton
          size="medium"
          onClick={buildCandidate}
        >
          Lock Formulation &amp; Prepare Validation
        </FilledButton>
      </div>

      {/* Current candidate summary */}
      {candidate.length > 0 && (
        <div className="card">
          <h3>Locked Candidate Formulation</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Role</th>
                <th>Concentration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Water</td>
                <td>Solvent</td>
                <td>{waterPct.toFixed(2)}%</td>
              </tr>
              {candidate.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>
                    <span className="chip">{c.category}</span>
                  </td>
                  <td>{(c.concentration * 100).toFixed(3)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
