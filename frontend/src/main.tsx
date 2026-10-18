import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import "./styles/masterScreens.css";
import "./styles/application.css";
import "./styles/navigation.css";
import "./styles/workspace-layout.css";
import { ExternalWalletProvider } from "./context/ExternalWalletContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExternalWalletProvider>
      <App />
    </ExternalWalletProvider>
  </React.StrictMode>
);
