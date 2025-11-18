import React, { useState } from "react";
import { useAccount,useWriteContract } from "wagmi";
import { RemittanceOrder721Abi } from "../../shared/abi/RemittanceOrder721";

const REMITTANCE_ADDRESS =
  import.meta.env.VITE_RAILX_REMITTANCE_ADDRESS as `0x${string}`;
const SUPABASE_FUNC_URL = import.meta.env
  .VITE_SUPABASE_FUNC_URL as string;

type PartyInfo = {
  name: string;
  nationality: string;
  birthDate: string; // YYYY-MM-DD
};

type RailxRemittanceInitRequest = {
  originator: PartyInfo;
  beneficiary: PartyInfo;
  amountKRW: number;
  beneficiaryAccount: string;
  corridorBankCode: string;
};

type FormState = {
  originator: PartyInfo;
  beneficiary: PartyInfo;
  amountKRW: string; // 입력은 문자열
  beneficiaryAccount: string;
  corridorBankCode: string; // 예: "J_BANK"
};

export function RemittanceFormPanel() {
  const [form, setForm] = useState<FormState>({
    originator: { name: "", nationality: "", birthDate: "" },
    beneficiary: { name: "", nationality: "", birthDate: "" },
    amountKRW: "",
    beneficiaryAccount: "",
    corridorBankCode: "J_BANK"
  });

  const [loading, setLoading] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();


  const handleChange =
    (path: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((prev) => {
        const clone: any = { ...prev };
        const keys = path.split(".");
        let cur: any = clone;
        for (let i = 0; i < keys.length - 1; i++) {
          cur[keys[i]] = { ...cur[keys[i]] };
          cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
        return clone;
      });
    };

    const onSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg(null);
      setLastTxHash(null);
    
      if (!isConnected || !address) {
        setErrorMsg("먼저 K은행 지갑(메타마스크)을 연결해줘.");
        return;
      }
    
      if (!SUPABASE_FUNC_URL) {
        setErrorMsg("VITE_SUPABASE_FUNC_URL 환경변수가 설정되어 있지 않음");
        return;
      }
      if (!REMITTANCE_ADDRESS) {
        setErrorMsg(
          "VITE_RAILX_REMITTANCE_ADDRESS 환경변수가 설정되어 있지 않음",
        );
        return;
      }
      if (!form.amountKRW || Number(form.amountKRW) <= 0) {
        setErrorMsg("송금액(KRW)을 올바르게 입력해줘");
        return;
      }
    
      // 🔹 여기서 originator / beneficiary 필수값 한번 체크 (서버 검증과 동일 조건)
      if (!form.originator.name || !form.beneficiary.name) {
        setErrorMsg(
          "송신자 / 수신자 이름은 필수야. 이름을 입력해줘.",
        );
        return;
      }
    
      setLoading(true);
      try {
        // 🔹 Supabase로 보낼 payload를 타입 맞춰서 변수로 빼기
        const payload: RailxRemittanceInitRequest = {
          originator: form.originator,
          beneficiary: form.beneficiary,
          amountKRW: Number(form.amountKRW),
          beneficiaryAccount: form.beneficiaryAccount,
          corridorBankCode: form.corridorBankCode,
        };
    
        console.log("railx-remittance-init payload:", payload);
    
        // 1) Supabase Edge Function 호출 (railx-remittance-init)
        const res = await fetch(
          // 네 환경변수에 따라:
          // - SUPABASE_FUNC_URL이 전체 URL이면: SUPABASE_FUNC_URL
          // - base URL이면: `${SUPABASE_FUNC_URL}/railx-remittance-init`
          `${SUPABASE_FUNC_URL}/railx-remittance-init`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
    
        if (!res.ok) {
          const text = await res.text();
          console.error("Supabase error:", text);
          throw new Error("Supabase 함수 호출 실패: " + text);
        }
    
        const data: {
          dstBankAddress: `0x${string}`;
          metaHash: `0x${string}`;
          encKeyWrapHash: `0x${string}`;
        } = await res.json();
    
        console.log("Supabase response:", data);
    
        const amountBig = BigInt(form.amountKRW);
        const expiry = BigInt(
          Math.floor(Date.now() / 1000) + 60 * 60, // 1시간 유효
        );
    
        // 2) 온체인 컨트랙트 호출: requestOrder(...)
        const txHash = await writeContractAsync({
          address: REMITTANCE_ADDRESS,
          abi: RemittanceOrder721Abi,
          functionName: "requestOrder",
          args: [
            data.metaHash,
            data.encKeyWrapHash,
            amountBig,
            data.dstBankAddress,
            expiry,
          ],
          account: address,
        });
    
        console.log("requestOrder txHash:", txHash);
        setLastTxHash(txHash);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err?.message ?? "알 수 없는 오류 발생");
      } finally {
        setLoading(false);
      }
    };
    

  return (
    <form
      onSubmit={onSubmit}
      style={{ padding: 20, border: "1px solid #ddd", borderRadius: 16 }}
    >
      <h2>송금 요청 생성 (K은행)</h2>

      <div style={{ marginTop: 12 }}>
        <h3>송신자 정보</h3>
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="송신자 이름"
          value={form.originator.name}
          onChange={handleChange("originator.name")}
        />
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="국적 (예: KR)"
          value={form.originator.nationality}
          onChange={handleChange("originator.nationality")}
        />
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="생년월일 (YYYY-MM-DD)"
          value={form.originator.birthDate}
          onChange={handleChange("originator.birthDate")}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>수신자 정보</h3>
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="수신자 이름"
          value={form.beneficiary.name}
          onChange={handleChange("beneficiary.name")}
        />
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="국적 (예: JP)"
          value={form.beneficiary.nationality}
          onChange={handleChange("beneficiary.nationality")}
        />
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="생년월일 (YYYY-MM-DD)"
          value={form.beneficiary.birthDate}
          onChange={handleChange("beneficiary.birthDate")}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>송금 정보</h3>
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          type="number"
          placeholder="송금액 (KRW)"
          value={form.amountKRW}
          onChange={handleChange("amountKRW")}
        />
        <input
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          placeholder="수신자 계좌번호"
          value={form.beneficiaryAccount}
          onChange={handleChange("beneficiaryAccount")}
        />

        <select
          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          value={form.corridorBankCode}
          onChange={handleChange("corridorBankCode")}
        >
          <option value="J_BANK">J_BANK (일본)</option>
          <option value="K_BANK">K_BANK (한국)</option>
        </select>

      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          borderRadius: 12,
          border: "none",
          background: loading ? "#888" : "black",
          color: "white",
          fontWeight: "bold",
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "처리 중..." : "송금 요청 생성 & 온체인 기록"}
      </button>

      {errorMsg && (
        <p style={{ marginTop: 12, color: "red", whiteSpace: "pre-wrap" }}>
          에러: {errorMsg}
        </p>
      )}

      {lastTxHash && (
        <p style={{ marginTop: 12, color: "green", wordBreak: "break-all" }}>
          온체인 기록 완료!<br />
          txHash: {lastTxHash}
        </p>
      )}
    </form>
  );
}
