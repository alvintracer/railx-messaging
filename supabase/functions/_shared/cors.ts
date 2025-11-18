// supabase/functions/_shared/cors.ts
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    // 필요한 경우 메서드도 명시 가능
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  