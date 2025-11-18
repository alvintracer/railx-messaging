// supabase/functions/railx-remittance-decrypt/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type DecryptRequestBody = {
  metaHash: string;
  privateKey: string; // 👈 새로 추가됨
};

// hex → bytes
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// 🔥 사용자가 보낸 PEM → RSA-OAEP 키로 변환
async function importPrivateKeyFromUser(pem: string): Promise<CryptoKey> {
  if (!pem) throw new Error("Private Key가 필요합니다.");

  try {
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
  } catch (err) {
    console.error("User key import error:", err);
    throw new Error("유효하지 않은 Private Key 형식입니다.");
  }
}

Deno.serve(async (req) => {
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
    const { metaHash, privateKey: userPrivateKeyPem } =
      (await req.json()) as DecryptRequestBody;

    if (!metaHash || !userPrivateKeyPem) {
      return new Response(
        JSON.stringify({ error: "metaHash와 privateKey 모두 필요합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ---- Supabase Client ----
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);

    // 1) DB 조회
    const { data: rec, error: selectError } = await supabase
      .from("railx_remittance_records")
      .select("file_path, aes_key_hex")
      .eq("meta_hash", metaHash)
      .maybeSingle();

    if (selectError) throw new Error("DB select failed");
    if (!rec) throw new Error("metaHash에 해당하는 기록이 없음");

    const encryptedAesKeyHex = rec.aes_key_hex;
    const filePath = rec.file_path;

    // 2) 암호화된 파일 다운로드
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("railx-messages")
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error("암호화된 파일 다운로드 실패");
    }

    const cipherBytes = new Uint8Array(await fileData.arrayBuffer());
    const iv = cipherBytes.slice(0, 12);
    const ciphertext = cipherBytes.slice(12);

    // 3) 🔥 사용자가 입력한 privateKey로 AES 키 복호화
    const privateKey = await importPrivateKeyFromUser(userPrivateKeyPem);

    const aesKeyBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      hexToBytes(encryptedAesKeyHex),
    );

    const aesKeyBytes = new Uint8Array(aesKeyBuffer);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesKeyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    // 4) AES-GCM 복호화
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext,
    );

    const payload = JSON.parse(new TextDecoder().decode(plainBuf));

    // 5) 🎉 최종 payload 반환
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Decrypt error:", err);
    return new Response(JSON.stringify({ error: err?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
