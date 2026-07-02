import { useState } from "react";
import { Tabs } from "@neo4j-ndl/react";
import ExploreTab from "./components/ExploreTab";
import FormulateTab from "./components/FormulateTab";
import ScenariosTab from "./components/ScenariosTab";
import ChatTab from "./components/ChatTab";
import QueryAuditDrawer from "./components/QueryAuditDrawer";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("explore");

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>
            <span className="header-icon">&#9883;</span> Cosmo R&D
          </h1>
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
