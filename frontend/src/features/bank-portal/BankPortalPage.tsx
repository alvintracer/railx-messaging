import React from "react";
import { RemittanceFormPanel } from "./RemittanceFormPanel";
import { WalletStatus } from "./WalletStatus";
import { ReceivedOrdersPanel } from "./ReceivedOrdersPanel";

export function BankPortalPage() {
  return (
    <div style={{ padding: 40 }}>
      <h1>RailX Messaging DApp (Bank Portal)</h1>
      <p style={{ opacity: 0.7 }}>
        K/J 은행 간 온체인 송금 메시징 & NFT 기반 송금 요청 PoC
      </p>

      <WalletStatus />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginTop: 24,
        }}
      >
        <RemittanceFormPanel />
        <ReceivedOrdersPanel />
      </div>
    </div>
  );
}
