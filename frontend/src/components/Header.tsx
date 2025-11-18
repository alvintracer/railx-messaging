// frontend/src/components/Header.tsx (새 파일 생성)

import React from 'react';
import { Flex, Button, Text, Spacer, Box, useToast } from '@chakra-ui/react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

// 주소 축약 헬퍼 함수
const truncateAddress = (address: string) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const toast = useToast();

  const handleConnect = () => {
    connect({ connector: injected() }, {
      onSuccess: (data) => {
        toast({
          title: '지갑 연결 성공',
          description: truncateAddress(data.accounts[0]),
          status: 'success',
          duration: 3000,
          isClosable: true,
          position: 'top-right',
        });
      },
      onError: (error) => {
        toast({
          title: '지갑 연결 실패',
          description: error.message,
          status: 'error',
          duration: 3000,
          isClosable: true,
          position: 'top-right',
        });
      }
    });
  };

  return (
    <Flex
      as="nav"
      align="center"
      justify="space-between"
      wrap="wrap"
      padding="1.5rem"
      bg="gray.800" // 어두운 헤더 배경색
      color="white"
      borderBottom="1px"
      borderColor="gray.700"
    >
      <Text fontSize="lg" fontWeight="bold">
        RailX Messaging
      </Text>
      <Spacer />
      <Box>
        {isConnected ? (
          // 연결 시: 축약된 주소와 Disconnect 버튼 표시
          <Button colorScheme="red" variant="outline" onClick={() => disconnect()}>
            {truncateAddress(address!)}
          </Button>
        ) : (
          // 미연결 시: "Connect" 버튼 표시
          <Button colorScheme="blue" onClick={handleConnect}>
            Connect
          </Button>
        )}
      </Box>
    </Flex>
  );
}