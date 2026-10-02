import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ExternalWalletProvider } from "./context/ExternalWalletContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExternalWalletProvider>
      <App />
    </ExternalWalletProvider>
  </React.StrictMode>
);
