import { useState, useEffect, useCallback } from "react";
import { FilledButton, LoadingSpinner, Banner } from "@neo4j-ndl/react";
import {
  getIngredients,
  getCommunities,
  getProductBOM,
  getProducts,
  getRDFClassification,
  type Ingredient,
  type Product,
  type CommunityMember,
  type BOMEntry,
} from "../lib/queries";

const COMMUNITY_COLORS = [
  "#2196F3", "#4CAF50", "#FF9800", "#E91E63", "#9C27B0",
  "#00BCD4", "#FF5722", "#607D8B", "#795548", "#3F51B5",
  "#CDDC39", "#009688", "#FFC107", "#673AB7", "#8BC34A",
];

export default function ExploreTab() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [communities, setCommunities] = useState<CommunityMember[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [rdfClasses, setRdfClasses] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [bom, setBom] = useState<BOMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [loadingRDF, setLoadingRDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getIngredients(), getProducts()])
      .then(([ings, prods]) => {
        setIngredients(ings);
        setProducts(prods);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadCommunities = useCallback(async () => {
    setLoadingCommunities(true);
    try {
      const c = await getCommunities();
      setCommunities(c);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
    setLoadingCommunities(false);
  }, []);

  const inspectIngredient = useCallback(async (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setLoadingRDF(true);
    try {
      const classes = await getRDFClassification(ing.name);
      setRdfClasses(classes);
    } catch {
      setRdfClasses([]);
    }
    setLoadingRDF(false);
  }, []);

  const inspectProduct = useCallback(async (prod: Product) => {
    setSelectedProduct(prod);
    try {
      const b = await getProductBOM(prod.sku);
      setBom(b);
    } catch {
      setBom([]);
    }
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <LoadingSpinner size="large" />
        Connecting to Neo4j...
      </div>
    );
  }

  if (error) {
    return <Banner variant="danger">{error}</Banner>;
  }

  // Group ingredients by category
  const byCategory: Record<string, Ingredient[]> = {};
  ingredients.forEach((i) => {
    if (!byCategory[i.category]) byCategory[i.category] = [];
    byCategory[i.category].push(i);
  });

  // Community color map
  const communityColorMap: Record<string, string> = {};
  communities.forEach((c) => {
    communityColorMap[c.name] = COMMUNITY_COLORS[c.communityId % COMMUNITY_COLORS.length];
  });

  return (
    <div>
      <div className="card-row">
        {/* Ingredient portfolio */}
        <div className="card" style={{ flex: 2 }}>
          <h3>
            Ingredient Portfolio ({ingredients.length} ingredients,{" "}
            {Object.keys(byCategory).length} categories)
          </h3>

          <div className="button-group" style={{ marginBottom: 12 }}>
            <FilledButton
              size="small"
              onClick={loadCommunities}
              isLoading={loadingCommunities}
              isDisabled={loadingCommunities}
            >
              Run GDS Community Detection
            </FilledButton>
          </div>

          <div style={{ maxHeight: 500, overflow: "auto" }}>
            {Object.entries(byCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cat, ings]) => (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#666",
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {cat} ({ings.length})
                  </div>
                  <div>
                    {ings.map((ing) => (
                      <span
                        key={ing.name}
                        className="chip"
                        style={{
                          cursor: "pointer",
                          borderLeft: communityColorMap[ing.name]
                            ? `3px solid ${communityColorMap[ing.name]}`
                            : undefined,
                        }}
                        onClick={() => inspectIngredient(ing)}
                      >
                        {ing.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Inspection panel */}
        <div className="card" style={{ flex: 1 }}>
          {selectedIngredient ? (
            <div>
              <h3>{selectedIngredient.name}</h3>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>INCI</td>
                    <td>{selectedIngredient.inci}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>CAS</td>
                    <td>{selectedIngredient.cas}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Category</td>
                    <td>{selectedIngredient.category}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Cost</td>
                    <td>${selectedIngredient.cost}/kg</td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ marginTop: 16 }}>
                RDF Classification (RDFS inference)
              </h3>
              {loadingRDF ? (
                <LoadingSpinner size="small" />
              ) : (
                <div>
                  {rdfClasses.map((cls) => (
                    <span key={cls} className="chip">
                      cosmo:{cls}
                    </span>
                  ))}
                </div>
              )}

              {selectedIngredient.turtle.includes("maxConcentration") && (
                <>
                  <h3 style={{ marginTop: 16 }}>Regulation Limits</h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Max %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {["EU", "US", "China", "Japan"].map((market) => {
                        const match = selectedIngredient.turtle.match(
                          new RegExp(`maxConcentration${market}\\s+"([^"]+)"`)
                        );
                        if (!match) return null;
                        return (
                          <tr key={market}>
                            <td>{market}</td>
                            <td>{(parseFloat(match[1]) * 100).toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Select an ingredient</h3>
              <p>Click any ingredient chip to inspect its RDF classification and regulation data</p>
            </div>
          )}
        </div>
      </div>

      {/* Product BOM explorer */}
      <div className="card">
        <h3>Product BOM Explorer</h3>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ width: 300, maxHeight: 300, overflow: "auto" }}>
            {products.map((p) => (
              <div
                key={p.sku}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  borderRadius: 4,
                  background:
                    selectedProduct?.sku === p.sku ? "#e3f2fd" : "transparent",
                  fontSize: 13,
                }}
                onClick={() => inspectProduct(p)}
              >
                <strong>{p.name}</strong>
                <span style={{ color: "#999", marginLeft: 8 }}>{p.type}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            {bom.length > 0 ? (
              <div>
                <h3>{selectedProduct?.name} — BOM Concentrations</h3>
                {bom.map((entry) => (
                  <div
                    key={entry.ingredient}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ width: 200, fontSize: 13, fontWeight: 500 }}>
                      {entry.ingredient}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        background: "#f0f0f0",
                        borderRadius: 4,
                        height: 20,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(entry.pct, 100)}%`,
                          background:
                            entry.pct > 50
                              ? "#2196F3"
                              : entry.pct > 10
                              ? "#4CAF50"
                              : entry.pct > 1
                              ? "#FF9800"
                              : "#E91E63",
                          height: "100%",
                          borderRadius: 4,
                          minWidth: 2,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 70,
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontSize: 13,
                      }}
                    >
                      {entry.pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>Select a product to view its BOM breakdown</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
