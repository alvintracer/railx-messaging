import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "./app/provider";
import { BankPortalPage } from "./features/bank-portal/BankPortalPage";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <BankPortalPage />
    </AppProvider>
  </React.StrictMode>
);
