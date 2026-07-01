import { useState, useEffect, useCallback } from "react";
import {
  getQueryLog,
  clearQueryLog,
  onQueryLogChange,
  type QueryLogEntry,
} from "../lib/neo4j";

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
