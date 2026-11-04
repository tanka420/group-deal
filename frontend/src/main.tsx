import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import "./styles/masterScreens.css";
import "./styles/application.css";
import "./styles/navigation.css";
import "./styles/workspace-layout.css";
import "./styles/workspace-refinements.css";
import "./styles/record-lists.css";
import "./styles/header.css";
import "./styles/product-theme.css";
import "./styles/storefront.css";
import "./styles/workspace-theme.css";
import "./styles/page-layout.css";
import { ExternalWalletProvider } from "./context/ExternalWalletContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExternalWalletProvider>
      <App />
    </ExternalWalletProvider>
  </React.StrictMode>
);
