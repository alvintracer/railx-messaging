// supabase/functions/railx-remittance-decrypt/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type DecryptRequestBody = {
  metaHash: string; // 0x... bytes32
};

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// J은행 RSA 개인키(PKCS#8) import
async function importJBankPrivateKey(): Promise<CryptoKey> {
  const pem = Deno.env.get("RAILX_J_BANK_RSA_PRIVATE_KEY_PEM") ?? "";
  if (!pem) {
    throw new Error("RAILX_J_BANK_RSA_PRIVATE_KEY_PEM이 설정되지 않았음");
  }

  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(
    atob(pemBody),
    (c) => c.charCodeAt(0),
  );

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"],
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Only POST allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = (await req.json()) as DecryptRequestBody;

    if (!body.metaHash) {
      return new Response(
        JSON.stringify({ error: "metaHash is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) {
      throw new Error(
        "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았음",
      );
    }
    const supabase = createClient(url, serviceKey);

    // 1) DB에서 meta_hash로 레코드 조회
    const { data: rec, error: selectError } = await supabase
      .from("railx_remittance_records")
      .select("file_path, aes_key_hex")
      .eq("meta_hash", body.metaHash)
      .maybeSingle();

    if (selectError) {
      console.error("DB select error:", selectError);
      return new Response(
        JSON.stringify({ error: "DB select failed" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!rec) {
      return new Response(
        JSON.stringify({ error: "record not found for metaHash" }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const bucket = "railx-messages"; // init과 동일한 버킷명
    const filePath: string = rec.file_path as string;
    const encryptedAesKeyHex: string = rec.aes_key_hex as string;

    // 2) Storage에서 암호화된 파일 다운로드
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Storage download failed" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const cipherBytes = new Uint8Array(await fileData.arrayBuffer());

    // encryptAesGcm에서 파일 포맷을 [IV(12) | Ciphertext] 로 저장
    const iv = cipherBytes.slice(0, 12);
    const ciphertext = cipherBytes.slice(12);

    // 3) RSA-OAEP로 AES 키 복호화
    const wrappedKeyBytes = hexToBytes(encryptedAesKeyHex);
    const privateKey = await importJBankPrivateKey();
    const aesKeyBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      wrappedKeyBytes,
    );
    const aesKeyBytes = new Uint8Array(aesKeyBuffer);

    if (![16, 24, 32].includes(aesKeyBytes.length)) {
      throw new Error(
        `Invalid AES key length after RSA decrypt: ${aesKeyBytes.length}`,
      );
    }

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      aesKeyBytes,
      "AES-GCM",
      false,
      ["decrypt"],
    );

    // 4) AES-GCM으로 파일 복호화
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext,
    );
    const plainBytes = new Uint8Array(plainBuf);

    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(plainBytes);
    const payload = JSON.parse(jsonStr);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    console.error("railx-remittance-decrypt error:", err);
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
