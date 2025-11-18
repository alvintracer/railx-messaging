// frontend/src/features/bank-portal/BankPortalPage.tsx

import React from "react";
import { RemittanceFormPanel } from "./RemittanceFormPanel";
// 1. WalletStatus 임포트 제거
// import { WalletStatus } from "./WalletStatus";
import { ReceivedOrdersPanel } from "./ReceivedOrdersPanel";

// 2. Chakra UI 컴포넌트 임포트
import {
  Container,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Heading,
  Text,
} from '@chakra-ui/react';

export function BankPortalPage() {
  return (
    // 3. 기존 div를 Chakra Container로 변경 (패딩, 최대 너비 등 자동 관리)
    <Container maxW="container.xl" py={{ base: 6, md: 8 }}> 
      {/* (h1, p 태그를 Chakra 컴포넌트로 변경) */}
      <Heading as="h1" size="lg" mb={2}>
        RailX Messaging DApp (Bank Portal)
      </Heading>
      <Text opacity={0.7} mb={6}>
        은행 간 프라이버시 보호 온체인 송금 메시징 프로토콜
      </Text>

      {/* 4. <WalletStatus /> 제거 */}

      {/* 5. 기존 div 그리드 대신 Tabs 컴포넌트 사용 */}
      <Tabs isFitted variant="soft-rounded" colorScheme="blue">
        <TabList mb="1.5em">
          <Tab>송금 요청 생성</Tab>
          <Tab>수신한 요청 확인</Tab>
        </TabList>
        {/* 탭 패널에 어두운 배경과 패딩 적용 */}
        <TabPanels bg="gray.800" borderRadius="md" p={{ base: 4, md: 6 }}>
          <TabPanel>
            <RemittanceFormPanel />
          </TabPanel>
          <TabPanel>
            <ReceivedOrdersPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
}