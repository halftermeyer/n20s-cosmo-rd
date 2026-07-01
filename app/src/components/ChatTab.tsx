import { useState, useRef, useEffect, useCallback } from "react";
import { FilledButton, LoadingSpinner } from "@neo4j-ndl/react";
import { GoogleGenAI, Type } from "@google/genai";
import {
  getIngredients,
  getProductBOM,
  getProducts,
  getRDFClassification,
  checkIncompatibility,
  validateCandidate,
  exportTurtle,
  type Ingredient,
} from "../lib/queries";
import { runQuery, getQueryLog } from "../lib/neo4j";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a cosmetics R&D assistant connected to a Neo4j graph database.
The graph contains 153 real cosmetic ingredients (with INCI names, CAS numbers, and RDF classification),
36 products with multi-level BOMs, and regulation limits for EU/US/China/Japan markets.

You can use the available tools to explore ingredients, analyze products, check compatibilities,
validate formulations against regulatory limits, and export RDF data.

When presenting results that involved database queries, show the key findings clearly.
Be concise but informative. Use tables or bullet points for structured data.
When a validation finds violations, highlight them prominently.
When asked "can I combine X with Y", check for INCOMPATIBLE_WITH relationships.
If incompatibilities are found, clearly say NO and explain why they should not be combined.

IMPORTANT: Every tool response includes a \`cypher_audit_trail\` section with the exact
Cypher/SPARQL/Jena-rules that were executed. ALWAYS show this audit trail in a fenced
\`\`\`cypher code block at the end of your response so the audience can reproduce the
computation in Neo4j Browser or cypher-shell. Use the trail verbatim — do not paraphrase.`;

const TOOLS = [
  {
    name: "run_cypher",
    description:
      "Run a Cypher query against the Neo4j cosmetics R&D graph. Use this for custom queries. The graph has nodes: Ingredient, Product, Phase, PreMix, Category, Supplier, Market, Brand, ProductLine, Ontology, SHACLRules. Key relationships: CONTAINS (with ratio property), BELONGS_TO, INCOMPATIBLE_WITH, COMPATIBLE_WITH, SUPPLIED_BY, SOLD_IN, PRODUCED_BY.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cypher: { type: Type.STRING, description: "The Cypher query to execute" },
      },
      required: ["cypher"],
    },
  },
  {
    name: "list_ingredients",
    description: "List all ingredients grouped by category, or filter by a specific category.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description:
            "Optional category filter. Options: Humectant, Emollient, RetinoidAgent, Antioxidant, Preservative, AHAExfoliant, BHAExfoliant, UVFilter, Surfactant, Thickener, VitaminDerivative, PlantExtract, Peptide, Ceramide, FragranceComponent",
        },
      },
    },
  },
  {
    name: "inspect_ingredient",
    description:
      "Get detailed info about an ingredient: INCI name, CAS, cost, RDF classification via RDFS inference, and regulation limits per market.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Ingredient name" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_product_bom",
    description: "Get the full bill of materials for a product with final concentrations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        product: { type: Type.STRING, description: "Product name or SKU" },
      },
      required: ["product"],
    },
  },
  {
    name: "check_incompatibilities",
    description: "Check for known incompatibilities between a set of ingredients.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ingredients: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of ingredient names to check",
        },
      },
      required: ["ingredients"],
    },
  },
  {
    name: "validate_formulation",
    description:
      "Validate a candidate formulation against EU/US/China/Japan regulation limits using n20s RDFS + Jena rules + SHACL. Concentrations as fractions (e.g., 0.05 = 5%).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ingredients: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              concentration: { type: Type.NUMBER },
            },
            required: ["name", "concentration"],
          },
          description: "List of {name, concentration} pairs",
        },
      },
      required: ["ingredients"],
    },
  },
  {
    name: "export_turtle_rdf",
    description: "Export ingredient RDF data as Turtle after RDFS inference, for regulatory audit.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ingredients: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of ingredient names to export",
        },
      },
      required: ["ingredients"],
    },
  },
];

async function executeToolInner(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "run_cypher": {
      const results = await runQuery(args.cypher as string);
      return results.slice(0, 50);
    }
    case "list_ingredients": {
      const ings = await getIngredients();
      if (args.category) {
        return ings.filter((i: Ingredient) => i.category === args.category)
          .map((i: Ingredient) => ({ name: i.name, inci: i.inci, cost: i.cost }));
      }
      const grouped: Record<string, string[]> = {};
      ings.forEach((i: Ingredient) => {
        if (!grouped[i.category]) grouped[i.category] = [];
        grouped[i.category].push(i.name);
      });
      return grouped;
    }
    case "inspect_ingredient": {
      const ings = await getIngredients();
      const ing = ings.find((i: Ingredient) => i.name === args.name);
      if (!ing) return { error: `Ingredient '${args.name}' not found` };
      const classes = await getRDFClassification(args.name as string);
      const limits: Record<string, string> = {};
      for (const market of ["EU", "US", "China", "Japan"]) {
        const match = ing.turtle.match(new RegExp(`maxConcentration${market}\\s+"([^"]+)"`));
        if (match) limits[market] = `${(parseFloat(match[1]) * 100).toFixed(2)}%`;
      }
      return { ...ing, rdfClasses: classes, regulationLimits_pct: limits, turtle: undefined };
    }
    case "get_product_bom": {
      const products = await getProducts();
      const prod = products.find(
        (p) => p.name === args.product || p.sku === args.product
      );
      if (!prod) return { error: `Product '${args.product}' not found` };
      return await getProductBOM(prod.sku);
    }
    case "check_incompatibilities": {
      const incompat = await checkIncompatibility(args.ingredients as string[]);
      if (incompat.length === 0) return { status: "No incompatibilities found" };
      return incompat;
    }
    case "validate_formulation": {
      return await validateCandidate(
        args.ingredients as { name: string; concentration: number }[]
      );
    }
    case "export_turtle_rdf": {
      const turtle = await exportTurtle(
        (args.ingredients as string[]).map((name) => ({ name, concentration: 0 }))
      );
      return { turtle: turtle.substring(0, 3000) };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  // Snapshot log length before execution
  const logBefore = getQueryLog().length;

  const result = await executeToolInner(name, args);

  // Capture queries that ran during this tool call
  const logAfter = getQueryLog();
  const newEntries = logAfter.slice(logBefore);
  const auditTrail = newEntries
    .map((e, i) => {
      let trail = `// Step ${i + 1} (${e.durationMs}ms, ${e.rowCount} rows)\n`;
      if (Object.keys(e.params).length > 0) {
        const paramStr = Object.entries(e.params)
          .map(([k, v]) => {
            const val = typeof v === "string" && v.length > 100 ? v.substring(0, 100) + "..." : JSON.stringify(v);
            return `:param ${k} => ${val}`;
          })
          .join("\n");
        trail += paramStr + "\n";
      }
      trail += e.cypher;
      return trail;
    })
    .join("\n\n");

  const response = {
    results: result,
    cypher_audit_trail: auditTrail || "// No queries executed",
  };

  return JSON.stringify(response, null, 2);
}

export default function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const chatHistory = messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        parts: [{ text: m.content }],
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          ...chatHistory,
          { role: "user", parts: [{ text: userMsg }] },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: TOOLS }],
        },
      });

      // Handle tool calls in a loop
      let currentResponse = response;
      const maxIterations = 5;

      for (let iter = 0; iter < maxIterations; iter++) {
        const candidate = currentResponse.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];
        const functionCalls = parts.filter((p) => p.functionCall);

        if (functionCalls.length === 0) {
          // No more tool calls — extract text
          const text = parts
            .filter((p) => p.text)
            .map((p) => p.text)
            .join("");
          if (text) {
            setMessages((prev) => [...prev, { role: "assistant", content: text }]);
          }
          break;
        }

        // Execute tool calls
        const toolResults = [];
        for (const part of functionCalls) {
          const fc = part.functionCall!;
          const result = await executeTool(fc.name!, fc.args as Record<string, unknown>);
          toolResults.push({
            functionResponse: {
              name: fc.name!,
              response: { result },
            },
          });
        }

        // Send tool results back
        currentResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            ...chatHistory,
            { role: "user", parts: [{ text: userMsg }] },
            { role: "model", parts: parts },
            { role: "user", parts: toolResults },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations: TOOLS }],
          },
        });
      }
    } catch (e: unknown) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${(e as Error).message}` },
      ]);
    }

    setLoading(false);
  }, [input, loading, messages, apiKey]);

  if (!apiKey) {
    return (
      <div className="empty-state">
        <h3>Gemini API Key Required</h3>
        <p>Set <code>VITE_GEMINI_API_KEY</code> in <code>app/.env</code></p>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h3>Cosmo R&D Assistant</h3>
            <p>Ask me about ingredients, products, formulations, or regulation compliance.</p>
          </div>
        )}

        <div className="chat-suggestions">
          {[
            "What retinoid ingredients do we have and what are their EU limits?",
            "Show me the BOM for Anti-Aging Serum V1",
            "Can I combine Retinol with Glycolic Acid?",
            "Validate a serum with Retinol at 0.06, Phenoxyethanol at 0.015, and Hyaluronic Acid at 0.04",
          ].map((s) => (
            <button
              key={s}
              className="chat-suggestion"
              onClick={() => {
                setInput(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-content">
              {msg.role === "assistant" ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdown(msg.content),
                  }}
                />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-message-content">
              <LoadingSpinner size="small" /> Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask about ingredients, formulations, compliance..."
          disabled={loading}
        />
        <FilledButton size="medium" onClick={sendMessage} isDisabled={loading || !input.trim()}>
          Send
        </FilledButton>
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="chat-code"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
