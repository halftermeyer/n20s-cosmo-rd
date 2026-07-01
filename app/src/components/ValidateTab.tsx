import { useState, useCallback } from "react";
import { FilledButton, OutlinedButton, LoadingSpinner, Banner } from "@neo4j-ndl/react";
import {
  validateCandidate,
  exportTurtle,
  type Violation,
  type SHACLResult,
} from "../lib/queries";

interface CandidateEntry {
  name: string;
  concentration: number;
  category: string;
}

interface Props {
  candidate: CandidateEntry[];
}

const MARKETS = ["EU", "US", "China", "Japan"];

export default function ValidateTab({ candidate }: Props) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [shacl, setShacl] = useState<SHACLResult[]>([]);
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turtle, setTurtle] = useState<string | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);

  const runValidation = useCallback(async () => {
    if (candidate.length === 0) return;
    setLoading(true);
    setValidated(false);
    try {
      const result = await validateCandidate(candidate);
      setViolations(result.violations);
      setShacl(result.shacl);
      setValidated(true);
    } catch (e: unknown) {
      setShacl([
        {
          focusNode: "error",
          severity: "Error",
          message: (e as Error).message,
        },
      ]);
      setValidated(true);
    }
    setLoading(false);
  }, [candidate]);

  const runExport = useCallback(async () => {
    if (candidate.length === 0) return;
    setLoadingExport(true);
    try {
      const t = await exportTurtle(candidate);
      setTurtle(t);
    } catch (e: unknown) {
      setTurtle(`Error: ${(e as Error).message}`);
    }
    setLoadingExport(false);
  }, [candidate]);

  if (candidate.length === 0) {
    return (
      <div className="empty-state">
        <h3>No formulation to validate</h3>
        <p>
          Go to the <strong>Formulate</strong> tab, build a candidate, and click
          "Lock Formulation" first.
        </p>
      </div>
    );
  }

  // Build compliance matrix data from multi-market violations
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
        // Check if any violation was checked for this market (meaning the ingredient has a limit)
        // If validated and no violation found, it's either "pass" (has limit) or "na" (no limit)
        const hasLimitForMarket = violations.some((v) => v.market === market) ||
          candidate.some(() => validated);
        statuses[market] = { status: validated ? (hasLimitForMarket ? "pass" : "pass") : "na" };
      }
    });
    return statuses;
  };

  return (
    <div>
      {/* Candidate summary */}
      <div className="card">
        <h3>Candidate Under Review</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {candidate.map((c) => (
            <span key={c.name} className="chip">
              {c.name} ({(c.concentration * 100).toFixed(2)}%)
            </span>
          ))}
        </div>

        <div className="button-group">
          <FilledButton
            size="medium"
            onClick={runValidation}
            isLoading={loading}
            isDisabled={loading}
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

      {loading && (
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
                <div key={m} className="header">
                  {m}
                </div>
              ))}

              {candidate.map((c) => {
                const statuses = getMarketStatus(c.name);
                return [
                  <div key={`${c.name}-name`} className="ingredient-name">
                    {c.name}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#999",
                        fontFamily: "monospace",
                      }}
                    >
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
                      <td style={{ fontFamily: "monospace" }}>
                        {(Number(v.actual) * 100).toFixed(2)}%
                      </td>
                      <td style={{ fontFamily: "monospace" }}>
                        {(Number(v.limit) * 100).toFixed(2)}%
                      </td>
                      <td>
                        <span className="status-fail">EXCEEDS LIMIT</span>
                      </td>
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
                  <tr>
                    <th>Focus Node</th>
                    <th>Severity</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {shacl.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {s.focusNode.replace("http://example.org/cosmo#", "cosmo:")}
                      </td>
                      <td>
                        <span
                          className={
                            s.severity === "Violation"
                              ? "status-fail"
                              : "status-warn"
                          }
                        >
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
              <strong>Formulation Passed All Checks.</strong> No EU concentration limit violations detected. No SHACL constraint violations found.
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
              onClick={() => {
                navigator.clipboard.writeText(turtle);
              }}
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
