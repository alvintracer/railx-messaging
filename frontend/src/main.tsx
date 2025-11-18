// frontend/src/main.tsx

import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "./app/provider";
// 1. BankPortalPage 임포트 제거
// import { BankPortalPage } from "./features/bank-portal/BankPortalPage";
import App from "./App"; // 2. App.tsx 임포트
import "./index.css"; // 3. index.css가 임포트되어 있는지 확인

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      {/* 4. BankPortalPage 대신 <App />을 렌더링 */}
      <App />
    </AppProvider>
  </React.StrictMode>
);