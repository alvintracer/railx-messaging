// src/features/bank-portal/WalletStatus.tsx
import React from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletStatus() {
  const { address, isConnected, chain } = useAccount();

  // wagmi v2 스타일: connector는 hook 결과로부터 꺼낸다
  const { connect, connectors, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnecting = connectStatus === "pending";

  if (!isConnected) {
    const connector = connectors[0]; // 우리는 provider에서 injected 메타마스크 하나만 등록했으니 0번이면 됨

    return (
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => connector && connect({ connector })}
          disabled={!connector || isConnecting}
          style={{
            padding: "8px 16px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "white",
            cursor: !connector || isConnecting ? "not-allowed" : "pointer",
          }}
        >
          {isConnecting ? "지갑 연결 중..." : "K은행 지갑 연결 (MetaMask)"}
        </button>
        {!connector && (
          <p style={{ marginTop: 8, fontSize: 12, color: "red" }}>
            사용 가능한 지갑 커넥터가 없습니다. 브라우저에 MetaMask가 설치되어 있는지
            확인해줘.
          </p>
        )}
      </div>
    );
  }

  // 지갑이 연결된 상태
  return (
    <div style={{ marginBottom: 16, fontSize: 14, padding: 8, borderRadius: 12, border: "1px solid #ddd" }}>
      <div>연결된 지갑: {address}</div>
      <div>체인: {chain?.name ?? "Unknown"}</div>
      <button
        type="button"
        onClick={() => disconnect()}
        style={{
          marginTop: 6,
          padding: "4px 10px",
          borderRadius: 10,
          border: "1px solid #ccc",
          background: "white",
          cursor: "pointer",
        }}
      >
        연결 해제
      </button>
    </div>
  );
}
