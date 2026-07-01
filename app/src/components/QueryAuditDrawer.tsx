import { useState, useEffect, useCallback } from "react";
import {
  getQueryLog,
  clearQueryLog,
  onQueryLogChange,
  type QueryLogEntry,
} from "../lib/neo4j";

function truncateValue(v: unknown): unknown {
  if (typeof v === "string" && v.length > 100) return v.substring(0, 100) + "...";
  if (Array.isArray(v)) return v.slice(0, 5).map(truncateValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = truncateValue(val);
    return out;
  }
  return v;
}

export default function QueryAuditDrawer() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<QueryLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLog(getQueryLog());
    return onQueryLogChange(() => setLog([...getQueryLog()]));
  }, []);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const handleClear = useCallback(() => {
    clearQueryLog();
    setExpandedId(null);
  }, []);

  const copyAll = useCallback(() => {
    const text = log
      .map((e) => {
        let s = `-- [${e.timestamp.toLocaleTimeString()}] ${e.durationMs}ms, ${e.rowCount} rows${e.error ? " ERROR" : ""}\n`;
        s += e.cypher + ";";
        if (Object.keys(e.params).length > 0) {
          s += `\n-- params: ${JSON.stringify(e.params, null, 2)}`;
        }
        return s;
      })
      .join("\n\n");
    navigator.clipboard.writeText(text);
  }, [log]);

  return (
    <>
      {/* Toggle button */}
      <button onClick={toggle} className="audit-toggle">
        <span className="audit-toggle-icon">{open ? ">" : "<"}</span>
        <span className="audit-toggle-label">
          Cypher ({log.length})
        </span>
      </button>

      {/* Drawer */}
      <div className={`audit-drawer ${open ? "open" : ""}`}>
        <div className="audit-header">
          <h3>Cypher Audit Log</h3>
          <div className="audit-actions">
            <button onClick={copyAll} className="audit-btn">
              Copy All
            </button>
            <button onClick={handleClear} className="audit-btn">
              Clear
            </button>
          </div>
        </div>

        <div className="audit-entries">
          {log.length === 0 && (
            <div className="audit-empty">
              No queries yet. Interact with the app to see Cypher statements.
            </div>
          )}
          {[...log].reverse().map((entry) => (
            <div
              key={entry.id}
              className={`audit-entry ${entry.error ? "error" : ""}`}
              onClick={() =>
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
            >
              <div className="audit-entry-header">
                <span className="audit-time">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                <span className="audit-duration">{entry.durationMs}ms</span>
                <span className="audit-rows">
                  {entry.error ? (
                    <span className="audit-error-badge">ERR</span>
                  ) : (
                    `${entry.rowCount} rows`
                  )}
                </span>
              </div>
              <div className="audit-cypher-preview">
                {entry.cypher.split("\n")[0].trim().substring(0, 80)}
                {entry.cypher.length > 80 ? "..." : ""}
              </div>

              {expandedId === entry.id && (
                <div className="audit-expanded">
                  <pre className="audit-cypher-full">{entry.cypher}</pre>
                  {Object.keys(entry.params).length > 0 && (
                    <div className="audit-params">
                      <strong>Parameters:</strong>
                      <pre>
                        {JSON.stringify(
                          entry.params,
                          (_k, v) =>
                            typeof v === "string" && v.length > 200
                              ? v.substring(0, 200) + "..."
                              : v,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  {entry.error && (
                    <div className="audit-error-detail">{entry.error}</div>
                  )}
                  {entry.results && entry.results.length > 0 && (
                    <ResultsSection results={entry.results} total={entry.rowCount} />
                  )}
                  <button
                    className="audit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(entry.cypher);
                    }}
                  >
                    Copy Query
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ResultsSection({ results, total }: { results: unknown[]; total: number }) {
  const [open, setOpen] = useState(false);

  const rows = results as Record<string, unknown>[];
  if (rows.length === 0) return null;

  const keys = Object.keys(rows[0]);

  return (
    <div className="audit-results" onClick={(e) => e.stopPropagation()}>
      <button
        className="audit-btn"
        onClick={() => setOpen(!open)}
        style={{ marginBottom: open ? 6 : 0 }}
      >
        {open ? "Hide" : "Show"} Results ({total} row{total !== 1 ? "s" : ""})
      </button>
      {open && (
        <div className="audit-results-table-wrap">
          <table className="audit-results-table">
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k}>{formatCell(row[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {total > rows.length && (
            <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
              Showing {rows.length} of {total} rows
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "object") {
    const s = JSON.stringify(truncateValue(val));
    return s.length > 80 ? s.substring(0, 80) + "..." : s;
  }
  const s = String(val);
  return s.length > 80 ? s.substring(0, 80) + "..." : s;
}
