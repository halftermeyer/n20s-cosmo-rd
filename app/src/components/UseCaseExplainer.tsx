import { useState } from "react";
import { Dialog } from "@neo4j-ndl/react";

interface ExplainerSlide {
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

interface UseCaseExplainerProps {
  slides: ExplainerSlide[];
}

export default function UseCaseExplainer({ slides }: UseCaseExplainerProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const slide = slides[page];

  return (
    <>
      <button
        className="explainer-trigger"
        onClick={() => { setOpen(true); setPage(0); }}
        title="What is this?"
      >
        ?
      </button>

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        size="large"
      >
        <Dialog.Header>{slide.title}</Dialog.Header>
        {slide.subtitle && <Dialog.Subtitle>{slide.subtitle}</Dialog.Subtitle>}
        <Dialog.Content>
          <div className="explainer-body">
            {slide.content}
          </div>
        </Dialog.Content>
        {slides.length > 1 && (
          <Dialog.Actions>
            <div className="explainer-nav">
              <div className="explainer-dots">
                {slides.map((_, i) => (
                  <span
                    key={i}
                    className={`explainer-dot ${i === page ? "active" : ""}`}
                    onClick={() => setPage(i)}
                  />
                ))}
              </div>
              <div className="explainer-buttons">
                <button
                  className="explainer-btn"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                >
                  Previous
                </button>
                <button
                  className="explainer-btn primary"
                  onClick={() => {
                    if (page < slides.length - 1) setPage(page + 1);
                    else setOpen(false);
                  }}
                >
                  {page < slides.length - 1 ? "Next" : "Got it"}
                </button>
              </div>
            </div>
          </Dialog.Actions>
        )}
      </Dialog>
    </>
  );
}

// ── Explainer content per section ─────────────────────────────

export const EXPLORE_SLIDES: ExplainerSlide[] = [
  {
    title: "Explore: Ingredient Portfolio",
    subtitle: "Browse, classify, and understand your raw materials",
    content: (
      <>
        <p>
          The <strong>Explore</strong> tab is your ingredient intelligence dashboard.
          It shows the full portfolio of 153 cosmetic ingredients stored in a Neo4j
          property graph, organized by functional category (humectants, emollients,
          retinoids, UV filters...).
        </p>
        <div className="explainer-highlight">
          <div className="explainer-label">What's happening under the hood</div>
          <p>
            A simple <code>MATCH (i:Ingredient)-[:BELONGS_TO]-&gt;(c:Category)</code> Cypher
            query retrieves the full portfolio. Each ingredient node carries a <code>turtle</code>
            property &mdash; an embedded RDF description with regulatory limits, chemical
            classifications, and ontology types.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "RDFS Classification",
    subtitle: "Infer what an ingredient IS from what it's declared as",
    content: (
      <>
        <p>
          Click any ingredient to see its <strong>RDF classification via RDFS inference</strong>.
          For example, <em>Retinol</em> is declared as a <code>RetinoidAgent</code> in its
          turtle data. But because the ontology says
          <code> RetinoidAgent rdfs:subClassOf PhotosensitiveAgent</code>,
          n20s infers that Retinol is <em>also</em> a <code>PhotosensitiveAgent</code> &mdash;
          without anyone manually tagging it.
        </p>
        <div className="explainer-flow">
          <span className="flow-step">Cypher selects ingredient</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">n20s loads turtle + ontology</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">RDFS backward chaining</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">All inferred classes returned</span>
        </div>
        <p className="explainer-takeaway">
          <strong>Why it matters:</strong> Regulatory rules often apply to entire <em>classes</em>
          of ingredients (e.g., "all photosensitive agents must have SPF protection"). RDFS
          inference catches ingredients that belong to a regulated class through inheritance,
          not just direct declaration.
        </p>
      </>
    ),
  },
  {
    title: "Product BOM Explorer",
    subtitle: "Multi-level bill-of-materials with concentration roll-up",
    content: (
      <>
        <p>
          Select any product to see its <strong>bill of materials</strong> (BOM) with
          final concentrations. Products have a tree structure:
        </p>
        <div className="explainer-flow">
          <span className="flow-step">Product</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">Phase</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">PreMix</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">Ingredient</span>
        </div>
        <p>
          Cypher walks the tree with <code>MATCH path = (p)-[:CONTAINS*]-&gt;(i:Ingredient)</code>
          and multiplies concentration ratios at each level using <code>reduce()</code>.
          This gives the actual percentage of each ingredient in the final product.
        </p>
        <p className="explainer-takeaway">
          <strong>Why it matters:</strong> Regulation limits apply to <em>final concentrations</em>,
          not the amount added at any single level. Deep graph traversal is the natural
          way to compute this.
        </p>
      </>
    ),
  },
];

export const FORMULATE_SLIDES: ExplainerSlide[] = [
  {
    title: "Formulate: Design & Validate",
    subtitle: "Build a candidate formula and check it against global regulations",
    content: (
      <>
        <p>
          The <strong>Formulate</strong> tab is a slot-based formula designer.
          Pick ingredients for 9 functional slots (humectant, emollient, retinoid,
          preservative...), adjust concentrations with sliders, and validate
          against EU, US, China, and Japan regulation limits &mdash; all in one workflow.
        </p>
        <div className="explainer-highlight">
          <div className="explainer-label">The validation pipeline</div>
          <ol>
            <li><strong>Incompatibility check</strong> &mdash; Cypher queries <code>INCOMPATIBLE_WITH</code> relationships between selected ingredients</li>
            <li><strong>Multi-market rules</strong> &mdash; n20s Jena rules with <code>greaterThan</code> builtins compare actual vs. allowed concentrations for 4 markets in a single pass</li>
            <li><strong>SHACL validation</strong> &mdash; shape constraints enforce labeling requirements (e.g., allergens must declare EU limits)</li>
            <li><strong>RDF export</strong> &mdash; the fully reasoned graph can be exported as Turtle for audit trail</li>
          </ol>
        </div>
      </>
    ),
  },
  {
    title: "How Multi-Market Validation Works",
    subtitle: "One RDF graph, four markets, one pass",
    content: (
      <>
        <p>
          Each ingredient's turtle property declares regulation limits per market:
        </p>
        <pre className="explainer-code">{`cosmo:Retinol
    cosmo:maxConcentrationEU "0.05"^^xsd:double ;
    cosmo:maxConcentrationUS "0.10"^^xsd:double ;
    cosmo:maxConcentrationChina "0.03"^^xsd:double .`}</pre>
        <p>
          n20s loads ingredient turtles + computed concentrations into an in-memory
          RDF graph, then fires <strong>Jena rules</strong> that compare actual vs. allowed
          values using the <code>greaterThan</code> builtin. One rule per market &mdash;
          all fire in a single reasoning pass.
        </p>
        <p className="explainer-takeaway">
          <strong>Why it matters:</strong> Adding a new market (e.g., Korea) is just adding
          one more rule &mdash; no code changes, no schema migration. The ontology is the
          configuration.
        </p>
      </>
    ),
  },
];

export const SCENARIOS_SLIDES: ExplainerSlide[] = [
  {
    title: "Scenarios: What-If Analysis",
    subtitle: "See how changes propagate through the graph + ontology",
    content: (
      <>
        <p>
          The <strong>Scenarios</strong> tab showcases four "what-if" analyses
          that combine deep graph traversal with RDF reasoning. Each scenario
          demonstrates a different pattern:
        </p>
        <div className="explainer-grid">
          <div className="explainer-card">
            <div className="explainer-card-num">1</div>
            <div>
              <strong>Regulatory change</strong><br />
              <span>RDFS class expansion + BOM traversal to find newly non-compliant products</span>
            </div>
          </div>
          <div className="explainer-card">
            <div className="explainer-card-num">2</div>
            <div>
              <strong>Photosensitivity</strong><br />
              <span>RDFS inference to find all photosensitive agents in non-SPF products</span>
            </div>
          </div>
          <div className="explainer-card">
            <div className="explainer-card-num">3</div>
            <div>
              <strong>Supplier disruption</strong><br />
              <span>Blast radius analysis + substitute validation with cost impact</span>
            </div>
          </div>
          <div className="explainer-card">
            <div className="explainer-card-num">4</div>
            <div>
              <strong>Allergen reclassification</strong><br />
              <span>Inject new RDF type + SHACL validation to find labeling gaps</span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    title: "The Pattern: Scope + Reason",
    subtitle: "Cypher traverses, n20s reasons",
    content: (
      <>
        <p>
          Every scenario follows the same mental model:
        </p>
        <div className="explainer-flow">
          <span className="flow-step">Cypher traverses</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">n20s projects RDF</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">Reasoning (RDFS / Rules / SHACL)</span>
          <span className="flow-arrow">&rarr;</span>
          <span className="flow-step">Results returned</span>
        </div>
        <p>
          The property graph determines <strong>WHAT</strong> gets reasoned about (which
          products, which markets, which suppliers). The RDF layer determines
          <strong> HOW</strong> it gets reasoned about (class hierarchies, rule logic,
          shape constraints).
        </p>
        <p className="explainer-takeaway">
          <strong>Why it matters:</strong> This separation means domain experts can
          update the ontology or rules without touching application code, and developers
          can change the graph queries without breaking the reasoning logic.
        </p>
      </>
    ),
  },
];

export const ASSISTANT_SLIDES: ExplainerSlide[] = [
  {
    title: "Assistant: AI-Powered Graph Exploration",
    subtitle: "Natural language queries backed by real graph operations",
    content: (
      <>
        <p>
          The <strong>Assistant</strong> tab is a Gemini-powered chatbot with
          <strong> function calling</strong>. It doesn't just generate text &mdash;
          it actually runs Cypher queries, n20s validations, and scenario analyses
          against the live graph, then interprets the results.
        </p>
        <div className="explainer-highlight">
          <div className="explainer-label">Available tools</div>
          <p>
            The assistant has 11 tools: run custom Cypher, list/inspect ingredients,
            check compatibility, validate formulations, export RDF, and run all
            4 scenario analyses. Every tool call is visible in the timeline and
            the full Cypher audit trail is in the side drawer.
          </p>
        </div>
        <p className="explainer-takeaway">
          <strong>Why it matters:</strong> This is a practical example of
          <strong> grounded AI</strong> &mdash; the LLM is constrained to tools
          that query a trusted knowledge graph. Every answer is traceable back to
          actual data through the audit log.
        </p>
      </>
    ),
  },
];
