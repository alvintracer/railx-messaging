// src/app/provider.tsx
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiConfig, createConfig, http } from "wagmi";
import { polygonAmoy } from "viem/chains";
import { injected } from "@wagmi/connectors";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [polygonAmoy],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [polygonAmoy.id]: http(import.meta.env.VITE_AMOY_RPC_URL),
  },
  ssr: false,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={config}>{children}</WagmiConfig>
    </QueryClientProvider>
  );
}
