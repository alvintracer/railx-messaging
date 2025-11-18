// frontend/src/app/provider.tsx

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// 1. WagmiConfig를 WagmiProvider로 변경 (wagmi v2 표준)
import { WagmiProvider, createConfig, http } from "wagmi";
import { polygonAmoy } from "viem/chains";
import { injected } from "@wagmi/connectors";
// 2. Chakra UI 관련 임포트 추가
import { ChakraProvider, extendTheme } from '@chakra-ui/react';

// 3. Chakra UI 다크 모드 테마 설정
const theme = extendTheme({
  config: {
    initialColorMode: 'dark', // 'dark' 모드 강제
    useSystemColorMode: false, // 시스템 설정 무시
  },
  styles: {
    global: {
      // body 스타일을 여기서 관리
      body: {
        bg: 'gray.900', // 전체 배경색
        color: 'whiteAlpha.900', // 기본 글자색
      },
    },
  },
});

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
    // 4. ChakraProvider를 최상단에 추가하고 theme 적용
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        {/* 5. WagmiConfig를 WagmiProvider로 변경 */}
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </QueryClientProvider>
    </ChakraProvider>
  );
}