import React, { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Input,
  InputGroup,
  InputRightElement,
  VStack,
  Code,
  Spinner,
  Center,
  Badge,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";

import { RemittanceOrder721Abi } from "../../shared/abi/RemittanceOrder721";

// === 환경 변수 ===
const SUPABASE_FUNC_URL = import.meta.env.VITE_SUPABASE_FUNC_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const REMITTANCE_ADDRESS = import.meta.env
  .VITE_RAILX_REMITTANCE_ADDRESS as `0x${string}`;
const DEPLOY_BLOCK_ENV = import.meta.env.VITE_RAILX_DEPLOY_BLOCK;

// === 타입 ===
type ReceivedOrder = {
  tokenId: bigint;
  srcBank: `0x${string}`;
  dstBank: `0x${string}`;
  txHash: `0x${string}`;
  metaHash: string;
};

export function ReceivedOrdersPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const toast = useToast();

  const [receivedOrders, setReceivedOrders] = useState<ReceivedOrder[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 모달 상태
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedOrder, setSelectedOrder] = useState<ReceivedOrder | null>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [decryptedData, setDecryptedData] = useState<any>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // ============================================================
  //  1) OrderRequested 이벤트 조회 + metaHash는 on-chain에서 readContract
  // ============================================================
  const fetchReceivedOrders = async () => {
    if (!publicClient || !address) return;

    setIsFetching(true);
    setFetchError(null);

    try {
      const latestBlock = await publicClient.getBlockNumber();

      let fromBlock: bigint;
      try {
        fromBlock = DEPLOY_BLOCK_ENV
          ? BigInt(DEPLOY_BLOCK_ENV)
          : latestBlock - 20000n;
        if (fromBlock < 0n) fromBlock = 0n;
      } catch {
        fromBlock = latestBlock - 10000n;
      }

      // OrderRequested 이벤트로 조회
      const logs = await publicClient.getLogs({
        address: REMITTANCE_ADDRESS,
        event: parseAbiItem(
          "event OrderRequested(uint256 indexed tokenId, address indexed srcBank, address indexed dstBank)"
        ),
        args: { dstBank: address as `0x${string}` },
        fromBlock,
        toBlock: latestBlock,
      });

      // metaHash는 logs에 없음 → readContract로 1개씩 조회
      const enrichedOrders: ReceivedOrder[] = [];

      for (const log of logs) {
        const tokenId = log.args.tokenId as bigint;

        const orderData: any = await publicClient.readContract({
          address: REMITTANCE_ADDRESS,
          abi: RemittanceOrder721Abi,
          functionName: "orders",
          args: [tokenId],
        });

        const metaHash =
          orderData.metaHash ??
          orderData[0] ??
          "";

        enrichedOrders.push({
          tokenId,
          srcBank: log.args.srcBank,
          dstBank: log.args.dstBank,
          txHash: log.transactionHash!,
          metaHash,
        });
      }

      // TokenId 내림차순 정렬
      enrichedOrders.sort((a, b) =>
        Number(b.tokenId - a.tokenId)
      );

      setReceivedOrders(enrichedOrders);
    } catch (err) {
      console.error(err);
      setFetchError("수신 송금 목록을 불러올 수 없습니다.");
    } finally {
      setIsFetching(false);
    }
  };

  // 초기 로드 및 일정 주기 자동 업데이트
  useEffect(() => {
    if (isConnected) {
      fetchReceivedOrders();
      const interval = setInterval(fetchReceivedOrders, 12000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, publicClient]);

  // ============================================================
  // 2) "프라이버시 보호 내용 보기" 클릭 → 모달 오픈
  // ============================================================
  const handleViewSecretClick = (order: ReceivedOrder) => {
    setSelectedOrder(order);
    setPrivateKey("");
    setShowKey(false);
    setDecryptedData(null);
    onOpen();
  };

  // ============================================================
  // 3) 복호화 요청 (Supabase Edge Function)
  // ============================================================
  const handleDecrypt = async () => {
    if (!selectedOrder?.metaHash || !privateKey.trim()) {
      toast({
        title: "오류",
        description: "Private Key를 입력해주세요.",
        status: "warning",
      });
      return;
    }

    setIsDecrypting(true);

    try {
      const endpoint = `${SUPABASE_FUNC_URL}/railx-remittance-decrypt`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          metaHash: selectedOrder.metaHash,
          privateKey: privateKey.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setDecryptedData(json);

      toast({
        title: "복호화 성공",
        status: "success",
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "복호화 실패",
        description: err.message,
        status: "error",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={4} color="white">
        수신한 송금 요청 (Inbound)
      </Text>

      {fetchError && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon />
          {fetchError}
          <Button ml="auto" size="sm" onClick={fetchReceivedOrders}>
            재시도
          </Button>
        </Alert>
      )}

      {/* 테이블 */}
      <Box
        overflowX="auto"
        bg="gray.800"
        borderRadius="lg"
        border="1px"
        borderColor="gray.700"
      >
        <Table variant="simple" colorScheme="whiteAlpha">
          <Thead bg="gray.900">
            <Tr>
              <Th color="gray.400">Token ID</Th>
              <Th color="gray.400">Sender</Th>
              <Th color="gray.400">MetaHash</Th>
              <Th textAlign="right" color="gray.400">
                Action
              </Th>
            </Tr>
          </Thead>

          <Tbody>
            {isFetching && receivedOrders.length === 0 ? (
              <Tr>
                <Td colSpan={4}>
                  <Center py={6} flexDirection="column">
                    <Spinner mb={2} color="teal.400" />
                    <Text color="gray.500">조회 중...</Text>
                  </Center>
                </Td>
              </Tr>
            ) : receivedOrders.length === 0 ? (
              <Tr>
                <Td colSpan={4} textAlign="center" py={8} color="gray.500">
                  아직 수신된 송금 요청이 없습니다.
                </Td>
              </Tr>
            ) : (
              receivedOrders.map((order) => (
                <Tr key={order.tokenId.toString()} _hover={{ bg: "gray.700" }}>
                  <Td>
                    <Badge colorScheme="teal">#{order.tokenId.toString()}</Badge>
                  </Td>
                  <Td fontFamily="monospace">
                    {order.srcBank.slice(0, 6)}...{order.srcBank.slice(-4)}
                  </Td>
                  <Td fontFamily="monospace" color="gray.300">
                    {order.metaHash.slice(0, 10)}...
                  </Td>
                  <Td textAlign="right">
                    <Button
                      size="sm"
                      colorScheme="teal"
                      onClick={() => handleViewSecretClick(order)}
                    >
                      보기
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>

      {/* 모달 */}
      {/* 복호화 모달 */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="gray.800" color="white" border="1px" borderColor="gray.700">
          <ModalHeader>보안 데이터 복호화</ModalHeader>
          <ModalCloseButton />

          <ModalBody py={6}>
            <VStack spacing={5} align="stretch">

              {/* 안내 박스 */}
              <Box bg="whiteAlpha.100" p={4} borderRadius="md">
                <Text fontSize="sm" color="gray.300">
                  Token ID <b>#{selectedOrder?.tokenId.toString()}</b>의 내용은 암호화되어 있습니다.<br/>
                  내용을 확인하려면 <b>수신 은행의 Private Key</b>를 입력하세요.
                </Text>
              </Box>

              {/* Private Key 입력 */}
              <Box>
                <Text mb={2} fontSize="sm" fontWeight="bold" color="teal.300">
                  Private Key (PEM Format)
                </Text>

                <InputGroup size="md">
                  <Input
                    pr="4.5rem"
                    type={showKey ? "text" : "password"}
                    placeholder="-----BEGIN PRIVATE KEY-----"
                    value={privateKey}
                    onChange={(e) => {
                      const val = e.target.value;

                      // ❶ Password 모드일 때는 표시 길이 제한 처리
                      if (!showKey) {
                        // 실제 값 저장
                        setPrivateKey(val);
                        return;
                      }

                      // showKey = true → 실제 보기 모드
                      setPrivateKey(val);
                    }}
                    bg="gray.900"
                    border="1px"
                    borderColor="gray.600"
                    _focus={{ borderColor: "teal.400", boxShadow: "0 0 0 1px #38B2AC" }}
                    height="3.5rem"
                    py={2}
                    fontSize="sm"
                    fontFamily="monospace"
                    css={{
                      // 실제 입력된 문자열을 마스킹하여 길이 15 이후는 '•'로 처리
                      WebkitTextSecurity: showKey ? "none" : "disc"
                    }}
                  />

                  <InputRightElement width="4.5rem" h="100%">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={() => setShowKey(!showKey)}
                      opacity={0.8}
                    >
                      {showKey ? "숨기기" : "보기"}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </Box>

              {/* ❷ 복호화 결과 — 상세 정보 UI */}
              {decryptedData && (
                <Box
                  bg="gray.900"
                  p={4}
                  borderRadius="md"
                  border="1px"
                  borderColor="teal.500"
                  maxH="350px"
                  overflowY="auto"
                  boxShadow="lg"
                >
                  <Text color="teal.300" fontWeight="bold" mb={2}>
                    🔓 복호화된 송금 데이터
                  </Text>

                  <VStack align="start" spacing={2} fontSize="sm">
                    <Text><b>버전:</b> {decryptedData.version ?? "N/A"}</Text>

                    <Text>
                      <b>송신자:</b> {decryptedData.originator?.name} /{" "}
                      {decryptedData.originator?.nationality} /{" "}
                      {decryptedData.originator?.birthDate}
                    </Text>

                    <Text>
                      <b>수신자:</b> {decryptedData.beneficiary?.name} /{" "}
                      {decryptedData.beneficiary?.nationality} /{" "}
                      {decryptedData.beneficiary?.birthDate}
                    </Text>

                    <Text><b>송금액(KRW):</b> {decryptedData.amountKRW ?? "(미기재)"}</Text>

                    <Text><b>수신 계좌:</b> {decryptedData.beneficiaryAccount}</Text>

                    <Text><b>코리도 코드:</b> {decryptedData.corridorBankCode}</Text>

                    {decryptedData.createdAt && (
                      <Text><b>생성 시각:</b> {decryptedData.createdAt}</Text>
                    )}

                    {/* ISO20022 */}
                    {decryptedData.iso20022 && (
                      <Box mt={3}>
                        <Text fontWeight="bold" color="teal.400">ISO 20022 (pacs.008)</Text>
                        <Text>메시지 타입: {decryptedData.iso20022.messageType}</Text>
                        <Text>TxID: {decryptedData.iso20022.txId}</Text>
                        <Text>생성 시각: {decryptedData.iso20022.creationDateTime}</Text>
                        <Text>
                          Debtor: {decryptedData.iso20022.debtor?.name} /{" "}
                          {decryptedData.iso20022.debtor?.country}
                        </Text>
                        <Text>
                          Creditor: {decryptedData.iso20022.creditor?.name} /{" "}
                          {decryptedData.iso20022.creditor?.country}
                        </Text>
                      </Box>
                    )}

                    {/* IVMS 101 */}
                    {decryptedData.ivms101 && (
                      <Box mt={3}>
                        <Text fontWeight="bold" color="teal.400">IVMS101 (Travel Rule)</Text>
                        <Text>Originator: {decryptedData.ivms101.originator?.name?.[0]?.nameIdentifier}</Text>
                        <Text>Beneficiary: {decryptedData.ivms101.beneficiary?.name?.[0]?.nameIdentifier}</Text>
                      </Box>
                    )}

                    {/* ZKP */}
                    {decryptedData.zkp && (
                      <Box mt={3}>
                        <Text fontWeight="bold" color="teal.400">ZKP 검증 결과</Text>
                        <Text>
                          Sanctions KYC: {decryptedData.zkp.sanctionsKyc?.status}
                        </Text>
                        <Text>
                          Sanctions KYT: {decryptedData.zkp.sanctionsKyt?.status}
                        </Text>
                      </Box>
                    )}

                    {/* 원본 JSON */}
                    <Box mt={3} width="100%">
                      <details>
                        <summary style={{ cursor: "pointer", color: "#4FD1C5", marginBottom: "6px" }}>
                          원본 JSON 보기
                        </summary>
                        <Code
                          display="block"
                          whiteSpace="pre-wrap"
                          bg="blackAlpha.700"
                          p={3}
                          borderRadius="md"
                          fontSize="xs"
                        >
                          {JSON.stringify(decryptedData, null, 2)}
                        </Code>
                      </details>
                    </Box>
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter borderTopWidth="1px" borderColor="gray.700">
            <Button variant="ghost" mr={3} onClick={onClose}>
              닫기
            </Button>
            <Button
              colorScheme="teal"
              onClick={handleDecrypt}
              isLoading={isDecrypting}
              loadingText="복호화 중..."
            >
              복호화 확인
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Box>
  );
}
