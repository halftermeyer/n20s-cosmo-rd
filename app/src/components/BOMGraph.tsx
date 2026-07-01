import { useRef, useCallback } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { Node, Relationship } from "@neo4j-nvl/base";
import type NVL from "@neo4j-nvl/base";
import type { BOMGraphNode, BOMGraphRel } from "../lib/queries";

const TYPE_COLORS: Record<string, string> = {
  Product: "#0b297d",
  Phase: "#006fd6",
  PreMix: "#00b4d8",
  Ingredient: "#4CAF50",
};

const TYPE_SIZES: Record<string, number> = {
  Product: 15,
  Phase: 12,
  PreMix: 10,
  Ingredient: 8,
};

const TIER_Y: Record<string, number> = {
  Product: 0,
  Phase: 300,
  PreMix: 600,
  Ingredient: 900,
};

type NvlRef = Partial<Pick<NVL, "fit">>;

interface Props {
  nodes: BOMGraphNode[];
  rels: BOMGraphRel[];
}

export default function BOMGraph({ nodes, rels }: Props) {
  const nvlRef = useRef<NvlRef | null>(null);

  const nodesByType: Record<string, BOMGraphNode[]> = {};
  nodes.forEach((n) => {
    if (!nodesByType[n.type]) nodesByType[n.type] = [];
    nodesByType[n.type].push(n);
  });

  const nvlNodes: Node[] = nodes.map((n) => {
    const tier = nodesByType[n.type] || [];
    const idx = tier.indexOf(n);
    const count = tier.length;
    const spreadX = (idx - (count - 1) / 2) * 250;
    const y = TIER_Y[n.type] ?? 600;

    return {
      id: n.id,
      size: TYPE_SIZES[n.type] || 8,
      color: TYPE_COLORS[n.type] || "#999",
      captions: [{ value: n.label, styles: ["bold"] }],
      x: spreadX,
      y: y + (Math.random() - 0.5) * 50,
      pinned: false,
    };
  });

  const nvlRels: Relationship[] = rels.map((r, i) => ({
    id: `rel-${i}`,
    from: r.source,
    to: r.target,
    captions: [{ value: `${(r.ratio * 100).toFixed(1)}%` }],
  }));

  const handleRef = useCallback((ref: NvlRef | null) => {
    if (ref) {
      nvlRef.current = ref;
      setTimeout(() => ref.fit?.(), 1000);
    }
  }, []);

  if (nodes.length === 0) {
    return (
      <div
        className="graph-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
        }}
      >
        Select a product to view its BOM graph
      </div>
    );
  }

  return (
    <div className="graph-container">
      <div
        style={{
          padding: "8px 12px",
          background: "#f5f5f5",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          gap: 16,
          fontSize: 12,
        }}
      >
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span
            key={type}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {type}
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: "#999" }}>
          Scroll to zoom, drag to pan
        </span>
      </div>
      <InteractiveNvlWrapper
        key={nodes.map((n) => n.id).join(",")}
        nodes={nvlNodes}
        rels={nvlRels}
        layout="forceDirected"
        nvlOptions={{
          relationshipThreshold: 0.55,
          useWebGL: false,
          initialZoom: 0.5,
        }}
        interactionOptions={{
          selectOnClick: true,
        }}
        ref={handleRef}
        style={{ height: "calc(100% - 36px)" }}
      />
    </div>
  );
}
