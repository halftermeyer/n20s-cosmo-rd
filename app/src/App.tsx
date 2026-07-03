import { useState } from "react";
import { Tabs } from "@neo4j-ndl/react";
import ExploreTab from "./components/ExploreTab";
import FormulateTab from "./components/FormulateTab";
import ScenariosTab from "./components/ScenariosTab";
import ChatTab from "./components/ChatTab";
import QueryAuditDrawer from "./components/QueryAuditDrawer";
import { getN20sMode } from "./lib/n20s";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("explore");
  const n20sMode = getN20sMode();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1>
              <span className="header-icon">&#9883;</span> Cosmo R&D
            </h1>
            <span className={`n20s-mode-badge ${n20sMode}`}>
              n20s {n20sMode === "server" ? "server" : "plugin"}
            </span>
          </div>
          <p className="subtitle">
            Graph-native formulation screening with Neo4j + GDS + n20s
          </p>
        </div>
      </header>

      <div className="app-tabs">
        <Tabs fill="underline" onChange={setActiveTab} value={activeTab}>
          <Tabs.Tab id="explore">Explore</Tabs.Tab>
          <Tabs.Tab id="formulate">Formulate</Tabs.Tab>
          <Tabs.Tab id="scenarios">Scenarios</Tabs.Tab>
          <Tabs.Tab id="chat">Assistant</Tabs.Tab>
        </Tabs>
      </div>

      <main className="app-main">
        {activeTab === "explore" && <ExploreTab />}
        {activeTab === "formulate" && <FormulateTab />}
        {activeTab === "scenarios" && <ScenariosTab />}
        {activeTab === "chat" && <ChatTab />}
      </main>

      <QueryAuditDrawer />
    </div>
  );
}

export default App;
