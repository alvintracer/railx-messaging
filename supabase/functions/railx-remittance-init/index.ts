// supabase/functions/railx-remittance-init/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { keccak256 } from "npm:ethers@6";
import { corsHeaders } from "../_shared/cors.ts";

// ---------- 타입 정의 ----------

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
  corridorBankCode: string; // 예: "J_BANK"
};

// ---------- 유틸 함수들 ----------

async function importJBankPublicKey(): Promise<CryptoKey> {
  const pem = Deno.env.get("RAILX_J_BANK_RSA_PUBLIC_KEY_PEM") ?? "";
  if (!pem) {
    throw new Error("RAILX_J_BANK_RSA_PUBLIC_KEY_PEM이 설정되지 않았음");
  }

  // -----BEGIN PUBLIC KEY----- -----END PUBLIC KEY----- 사이 내용 추출
  const pemBody = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(
    atob(pemBody),
    (c) => c.charCodeAt(0),
  );

  return await crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );
}


async function getSupabaseAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았음");
  }

  return createClient(url, serviceKey);
}

function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// AES-GCM 암호화: (파일 바이트, AES 키 바이트) 반환
async function encryptAesGcm(
  plainBytes: Uint8Array,
): Promise<{ fileBytes: Uint8Array; aesKeyBytes: Uint8Array }> {
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32)); // 256bit
  const key = await crypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    "AES-GCM",
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96bit IV (GCM 권장)
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plainBytes,
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  // 파일 포맷: [ IV | Ciphertext ]
  const fileBytes = new Uint8Array(iv.length + cipherBytes.length);
  fileBytes.set(iv, 0);
  fileBytes.set(cipherBytes, iv.length);

  return { fileBytes, aesKeyBytes };
}

function getDstBankAddress(corridorBankCode: string): `0x${string}` {
  // 환경변수에서 J은행 주소 읽기
  const jBankAddress =
    (Deno.env.get("RAILX_J_BANK_ADDRESS") as `0x${string}` | null) ??
    "0x0000000000000000000000000000000000000000";

  switch (corridorBankCode) {
    case "J_BANK":
      return jBankAddress;
    default:
      return "0x0000000000000000000000000000000000000000";
  }
}

// ---------- 메인 핸들러 ----------

Deno.serve(async (req: Request): Promise<Response> => {
  // 1) CORS 프리플라이트 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Only POST requests are allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = (await req.json()) as RailxRemittanceInitRequest;

    // TODO: 나중에 실제 서비스 시 필수 필드 검증 다시 켜기
    // (안전 장치) 최소 필드 체크
    if (!body.originator?.name || !body.beneficiary?.name) {
      return new Response(
        JSON.stringify({ error: "originator / beneficiary 정보가 부족함" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // 2) "홍-P 파일"용 페이로드 구성
    const nowIso = new Date().toISOString();

    // (1) ISO 20022 pacs.008 스타일 간단 버전
    const iso20022 = {
      messageType: "pacs.008.001.10",
      txId: crypto.randomUUID(),
      creationDateTime: nowIso,
      debtor: {
        name: body.originator.name,
        country: body.originator.nationality,
        birthDate: body.originator.birthDate,
      },
      creditor: {
        name: body.beneficiary.name,
        country: body.beneficiary.nationality,
        birthDate: body.beneficiary.birthDate,
      },
      interbankSettlementAmount: {
        ccy: "KRW",
        amount: body.amountKRW,
      },
      debtorAccount: {
        // 실제로는 KRW 계좌, 여기선 송신 은행 내부 계좌라고 가정
        type: "INTERNAL_KRW",
      },
      creditorAccount: {
        accountNumber: body.beneficiaryAccount,
        accountType: "BENEFICIARY",
      },
      corridorBankCode: body.corridorBankCode, // 예: J_BANK
    };

    // (2) IVMS101 스타일 간단 버전
    const ivms101 = {
      originator: {
        name: [
          {
            nameIdentifier: body.originator.name,
            nameIdentifierType: "LEGL", // Legal name
          },
        ],
        dateAndPlaceOfBirth: {
          dateOfBirth: body.originator.birthDate,
        },
        nationalIdentification: {
          countryOfIssue: body.originator.nationality,
        },
      },
      beneficiary: {
        name: [
          {
            nameIdentifier: body.beneficiary.name,
            nameIdentifierType: "LEGL",
          },
        ],
        dateAndPlaceOfBirth: {
          dateOfBirth: body.beneficiary.birthDate,
        },
        nationalIdentification: {
          countryOfIssue: body.beneficiary.nationality,
        },
      },
      amount: {
        currency: "KRW",
        amount: body.amountKRW,
      },
      beneficiaryAccountNumber: body.beneficiaryAccount,
    };

    // (3) ZKP 결과 구조 (지금은 placeholder)
    const zkp = {
      sanctionsKyc: {
        type: "Proof_Sanctions_KYC",
        status: "VALID",
        checkedLists: ["OFAC", "UN", "EU"],
        // 실제로는 서킷 ID, public input hash 등 추가 가능
        createdAt: nowIso,
      },
      sanctionsKyt: {
        type: "Proof_Sanctions_KYT",
        status: "VALID",
        checkedLists: ["OFAC_ADDR", "EXCHANGE_BLACKLIST"],
        createdAt: nowIso,
      },
    };

    // 최종 payload (기존 필드 + 표준 구조)
    const payload = {
      // 기존 단순 필드 (J은행 UI에서 사용 중)
      originator: body.originator,
      beneficiary: body.beneficiary,
      amountKRW: body.amountKRW,
      beneficiaryAccount: body.beneficiaryAccount,
      corridorBankCode: body.corridorBankCode,

      // 새로 추가한 국지 표준 뼈대
      iso20022,
      ivms101,
      zkp,

      createdAt: nowIso,
      version: "railx-omp-v0.1",
    };


    const encoder = new TextEncoder();
    const plainBytes = encoder.encode(JSON.stringify(payload));

    // 3) AES-GCM 암호화
    const { fileBytes, aesKeyBytes } = await encryptAesGcm(plainBytes);

    // 3-A) J은행 RSA 공개키로 AES 키 암호화 (Key Wrapping)
    const jbankPubKey = await importJBankPublicKey();
    const wrappedKeyBuffer = await crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      jbankPubKey,
      aesKeyBytes,
    );
    const wrappedKeyBytes = new Uint8Array(wrappedKeyBuffer);
    const encryptedAesKeyHex = bytesToHex(wrappedKeyBytes);


    // 4) Supabase Storage 업로드
    const supabase = await getSupabaseAdminClient();
    const bucket = "railx-messages"; // 미리 만들어둔 버킷 이름이라고 가정
    const filename = `orders/${Date.now()}-${crypto.randomUUID()}.bin`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, fileBytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Storage upload failed" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // (선택) 공개 URL이 필요하면 사용
    const { data: publicInfo } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    const fileUrl = publicInfo.publicUrl;

    // 5) metaHash / encKeyWrapHash 계산
    // - metaHash : 암호화된 파일 바이트에 대한 keccak256
    // - encKeyWrapHash : AES 키 바이트에 대한 keccak256 (실제 구현에선 "J은행 공개키로 wrapping된 키"를 해시)
    const metaHash = keccak256(fileBytes);
    const encKeyWrapHash = keccak256(aesKeyBytes);

    // hex 문자열로 변환
    const aesKeyHex = bytesToHex(aesKeyBytes);
    const metaHashHex = metaHash; // keccak256이 이미 0x... hex 리턴
    const encKeyWrapHashHex = encKeyWrapHash;

    // 6) DB에 레코드 저장 (PoC용, 실서비스는 안전한 키 관리로 대체)
    const { error: insertError } = await supabase
    .from("railx_remittance_records")
    .insert({
      meta_hash: metaHashHex,
      enc_key_wrap_hash: encKeyWrapHashHex,
      file_path: filename,
      // aes_key_hex: aesKeyHex, // <- 점점 없애갈 친구
      aes_key_hex: encryptedAesKeyHex,
    });
  
    if (insertError) {
      console.error("DB insert error:", insertError);
      return new Response(
        JSON.stringify({
          error: "DB insert failed",
          details: insertError, // <- 이걸로 자세한 원인 같이 보내기
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const dstBankAddress = getDstBankAddress(body.corridorBankCode);

    const responsePayload = {
      dstBankAddress,
      metaHash,
      encKeyWrapHash,
      fileUrl, // NFT 메타데이터에 넣어도 되고, 오프체인 레코드용으로 써도 됨
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    console.error("railx-remittance-init error:", err);

    return new Response(
      JSON.stringify({ error: err?.message ?? "unknown error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
