import React, { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseAbiItem } from "viem";
import { RemittanceOrder721Abi } from "../../shared/abi/RemittanceOrder721";

const SUPABASE_FUNC_URL = import.meta.env
  .VITE_SUPABASE_FUNC_URL as string;

const REMITTANCE_ADDRESS =
  import.meta.env.VITE_RAILX_REMITTANCE_ADDRESS as `0x${string}`;

// 배포 블록(10진수)을 .env에 넣어두면 여기서 참조, 없으면 최근 9,000블록만 조회
const DEPLOY_BLOCK_ENV = import.meta.env.VITE_RAILX_DEPLOY_BLOCK;

type ReceivedOrder = {
  tokenId: bigint;
  srcBank: `0x${string}`;
  dstBank: `0x${string}`;
  txHash: `0x${string}`;
};

type DecryptedPayload = {
    originator?: any;
    beneficiary?: any;
    amountKRW?: number;
    beneficiaryAccount?: string;
    corridorBankCode?: string;
    iso20022?: any;
    ivms101?: any;
    zkp?: any;
    createdAt?: string;
    version?: string;
    [key: string]: any;
  };
  

export function ReceivedOrdersPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [orders, setOrders] = useState<ReceivedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedTokenId, setSelectedTokenId] =
    useState<bigint | null>(null);
  const [decryptedPayload, setDecryptedPayload] =
    useState<DecryptedPayload | null>(null);
  const [decryptLoading, setDecryptLoading] = useState(false);

  // 1) J은행 인박스: 내 지갑으로 들어온 OrderRequested 로그 조회
  useEffect(() => {
    if (!isConnected || !address || !publicClient) return;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const event = parseAbiItem(
          "event OrderRequested(uint256 indexed tokenId, address indexed srcBank, address indexed dstBank)"
        );

        const latestBlock = await publicClient.getBlockNumber();

        // QuickNode 제한: eth_getLogs 범위 10,000블록 미만
        const maxSpan = 9000n;
        let fromBlock: bigint;

        if (DEPLOY_BLOCK_ENV) {
          const deployBlock = BigInt(DEPLOY_BLOCK_ENV);
          const minFrom =
            latestBlock > maxSpan ? latestBlock - maxSpan : 0n;
          fromBlock = deployBlock > minFrom ? deployBlock : minFrom;
        } else {
          fromBlock =
            latestBlock > maxSpan ? latestBlock - maxSpan : 0n;
        }

        const logs = await publicClient.getLogs({
          address: REMITTANCE_ADDRESS,
          event,
          args: { dstBank: address as `0x${string}` },
          fromBlock,
          toBlock: latestBlock,
        });

        const parsed: ReceivedOrder[] = logs.map((log) => ({
          tokenId: log.args.tokenId as bigint,
          srcBank: log.args.srcBank as `0x${string}`,
          dstBank: log.args.dstBank as `0x${string}`,
          txHash: log.transactionHash!,
        }));

        // 토큰 ID 기준 중복 제거
        const uniqueByToken = new Map<string, ReceivedOrder>();
        for (const o of parsed) {
          uniqueByToken.set(o.tokenId.toString(), o);
        }

        setOrders(
          Array.from(uniqueByToken.values()).sort((a, b) =>
            Number(b.tokenId - a.tokenId)
          )
        );
      } catch (err: any) {
        console.error("Failed to load received orders:", err);
        setErrorMsg(err?.message ?? "주문 목록 조회 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [isConnected, address, publicClient]);

  // 2) 특정 tokenId의 프라이버시 보호 내용(홍-P) 보기
  const handleViewPayload = async (tokenId: bigint) => {
    if (!publicClient) return;
    if (!SUPABASE_FUNC_URL) {
      setErrorMsg("VITE_SUPABASE_FUNC_URL이 설정되어 있지 않음");
      return;
    }

    setDecryptLoading(true);
    setErrorMsg(null);
    setDecryptedPayload(null);
    setSelectedTokenId(tokenId);

    try {
      // 2-1) on-chain orders(tokenId)에서 metaHash 가져오기
      const order = (await publicClient.readContract({
        address: REMITTANCE_ADDRESS,
        abi: RemittanceOrder721Abi,
        functionName: "orders",
        args: [tokenId],
      })) as any;

      // viem이 struct를 어떻게 리턴하느냐에 따라
        // - order.metaHash (named field)
        // - 또는 order[0] (첫 번째 요소) 로 들어올 수 있음
        const metaHashFromStruct =
        (order.metaHash as `0x${string}` | undefined) ??
        (order[0] as `0x${string}` | undefined);

        if (!metaHashFromStruct) {
        setErrorMsg("온체인 주문에서 metaHash를 찾지 못했음");
        setDecryptLoading(false);
        return;
        }

        const metaHash: `0x${string}` = metaHashFromStruct;

      // 2-2) Supabase decrypt 함수 호출
      const res = await fetch(
        `${SUPABASE_FUNC_URL}/railx-remittance-decrypt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metaHash }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        console.error("decrypt error:", json);
        throw new Error(json.error ?? "decrypt failed");
      }

      setDecryptedPayload(json);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "payload 조회 실패");
    } finally {
      setDecryptLoading(false);
    }
  };

  // 3) approveOrder (J은행 결제 승인)
  const handleApprove = async (tokenId: bigint) => {
    setErrorMsg(null);
    setActionMsg(null);

    if (!isConnected || !address) {
      setErrorMsg("먼저 J은행 지갑(메타마스크)을 연결해줘.");
      return;
    }

    try {
      setActionMsg(`토큰 #${tokenId} 승인 트랜잭션 생성 중...`);

      const txHash = await writeContractAsync({
        address: REMITTANCE_ADDRESS,
        abi: RemittanceOrder721Abi,
        functionName: "approveOrder",
        args: [tokenId, "0x"], // ZKP attestation은 나중에 실제 값으로
        account: address as `0x${string}`,
      });

      setActionMsg(
        `토큰 #${tokenId} 승인 완료. txHash: ${txHash}`
      );
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "approveOrder 실패");
    }
  };

  return (
    <div
      style={{
        marginTop: 32,
        padding: 20,
        borderRadius: 16,
        border: "1px solid #ddd",
      }}
    >
      <h2>수신된 송금 요청 (J은행 인박스)</h2>

      {!isConnected && (
        <p style={{ marginTop: 8 }}>
          상단에서 J은행 지갑을 연결하면, 이 지갑으로 들어온 NFT 기반 송금
          요청이 여기에 표시됨.
        </p>
      )}

      {loading && <p style={{ marginTop: 8 }}>주문 목록 불러오는 중...</p>}

      {errorMsg && (
        <p style={{ marginTop: 8, color: "red", whiteSpace: "pre-wrap" }}>
          에러: {errorMsg}
        </p>
      )}

      {actionMsg && (
        <p style={{ marginTop: 8, color: "green", whiteSpace: "pre-wrap" }}>
          {actionMsg}
        </p>
      )}

      {!loading && orders.length === 0 && isConnected && (
        <p style={{ marginTop: 8 }}>
          현재 이 지갑 주소로 도착한 송금 요청 NFT가 없습니다.
        </p>
      )}

      {orders.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {orders.map((o) => (
            <div
              key={o.tokenId.toString()}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid #eee",
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              <div>
                <strong>토큰 ID:</strong> {o.tokenId.toString()}
              </div>
              <div>
                <strong>송신 은행 (srcBank):</strong>{" "}
                {o.srcBank.slice(0, 8)}...{o.srcBank.slice(-4)}
              </div>
              <div>
                <strong>수신 은행 (dstBank):</strong>{" "}
                {o.dstBank.slice(0, 8)}...{o.dstBank.slice(-4)}
              </div>
              <div>
                <strong>요청 txHash:</strong>{" "}
                {o.txHash.slice(0, 10)}...{o.txHash.slice(-4)}
              </div>
              <button
                type="button"
                onClick={() => handleViewPayload(o.tokenId)}
                style={{
                  marginTop: 6,
                  marginRight: 8,
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                프라이버시 보호 내용 보기
              </button>
              <button
                type="button"
                onClick={() => handleApprove(o.tokenId)}
                style={{
                  marginTop: 6,
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "black",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                이 송금 요청 승인 (approveOrder)
              </button>
            </div>
          ))}
        </div>
      )}

      {decryptLoading && (
        <p style={{ marginTop: 12 }}>프라이버시 보호 내용 복호화 중...</p>
      )}
        {decryptedPayload && selectedTokenId !== null && (
        <div
            style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            border: "1px dashed #aaa",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            }}
        >
            <h3>토큰 #{selectedTokenId.toString()}의 프라이버시 보호 내용</h3>

            {/* 1) 기본 KYC/송금 요약 */}
            <p>
            <strong>버전:</strong> {decryptedPayload.version ?? "N/A"}
            </p>
            <p>
            <strong>송신자:</strong>{" "}
            {decryptedPayload.originator?.name} /{" "}
            {decryptedPayload.originator?.nationality} /{" "}
            {decryptedPayload.originator?.birthDate}
            </p>
            <p>
            <strong>수신자:</strong>{" "}
            {decryptedPayload.beneficiary?.name} /{" "}
            {decryptedPayload.beneficiary?.nationality} /{" "}
            {decryptedPayload.beneficiary?.birthDate}
            </p>
            <p>
            <strong>송금액(KRW):</strong>{" "}
            {decryptedPayload.amountKRW ?? "(미기재)"}
            </p>
            <p>
            <strong>수신 계좌:</strong>{" "}
            {decryptedPayload.beneficiaryAccount ?? "(미기재)"}
            </p>
            <p>
            <strong>코리도 코드:</strong>{" "}
            {decryptedPayload.corridorBankCode ?? "(미기재)"}
            </p>
            {decryptedPayload.createdAt && (
            <p>
                <strong>생성 시각:</strong> {decryptedPayload.createdAt}
            </p>
            )}

            {/* 2) ISO 20022 섹션 */}
            {decryptedPayload.iso20022 && (
            <div style={{ marginTop: 12 }}>
                <h4>ISO 20022 (pacs.008 요약)</h4>
                <p>
                <strong>메시지 타입:</strong>{" "}
                {decryptedPayload.iso20022.messageType}
                </p>
                <p>
                <strong>트랜잭션 ID:</strong>{" "}
                {decryptedPayload.iso20022.txId}
                </p>
                <p>
                <strong>생성 시각:</strong>{" "}
                {decryptedPayload.iso20022.creationDateTime}
                </p>
                <p>
                <strong>Debtor:</strong>{" "}
                {decryptedPayload.iso20022.debtor?.name} (
                {decryptedPayload.iso20022.debtor?.country})
                </p>
                <p>
                <strong>Creditor:</strong>{" "}
                {decryptedPayload.iso20022.creditor?.name} (
                {decryptedPayload.iso20022.creditor?.country})
                </p>
                <p>
                <strong>Interbank Amount:</strong>{" "}
                {decryptedPayload.iso20022.interbankSettlementAmount?.amount}{" "}
                {decryptedPayload.iso20022.interbankSettlementAmount?.ccy}
                </p>
            </div>
            )}

            {/* 3) IVMS101 섹션 */}
            {decryptedPayload.ivms101 && (
            <div style={{ marginTop: 12 }}>
                <h4>IVMS101 (Travel Rule)</h4>
                <p>
                <strong>Originator name:</strong>{" "}
                {decryptedPayload.ivms101.originator?.name?.[0]
                    ?.nameIdentifier}
                </p>
                <p>
                <strong>Originator DoB:</strong>{" "}
                {
                    decryptedPayload.ivms101.originator?.dateAndPlaceOfBirth
                    ?.dateOfBirth
                }
                </p>
                <p>
                <strong>Beneficiary name:</strong>{" "}
                {decryptedPayload.ivms101.beneficiary?.name?.[0]
                    ?.nameIdentifier}
                </p>
                <p>
                <strong>Beneficiary DoB:</strong>{" "}
                {
                    decryptedPayload.ivms101.beneficiary?.dateAndPlaceOfBirth
                    ?.dateOfBirth
                }
                </p>
                <p>
                <strong>IVMS Amount:</strong>{" "}
                {decryptedPayload.ivms101.amount?.amount}{" "}
                {decryptedPayload.ivms101.amount?.currency}
                </p>
            </div>
            )}

            {/* 4) ZKP 섹션 */}
            {decryptedPayload.zkp && (
            <div style={{ marginTop: 12 }}>
                <h4>ZKP 검증 결과</h4>
                <p>
                <strong>Sanctions KYC:</strong>{" "}
                {decryptedPayload.zkp.sanctionsKyc?.status} /{" "}
                {decryptedPayload.zkp.sanctionsKyc?.checkedLists?.join(", ")}
                </p>
                <p>
                <strong>Sanctions KYT:</strong>{" "}
                {decryptedPayload.zkp.sanctionsKyt?.status} /{" "}
                {decryptedPayload.zkp.sanctionsKyt?.checkedLists?.join(", ")}
                </p>
            </div>
            )}

            {/* 5) 원본 JSON */}
            <details style={{ marginTop: 8 }}>
            <summary>원본 JSON 보기</summary>
            <pre style={{ fontSize: 12 }}>
                {JSON.stringify(decryptedPayload, null, 2)}
            </pre>
            </details>
        </div>
        )}

    </div>
  );
}
