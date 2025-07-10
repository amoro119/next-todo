// supabase/functions/token-issuer/index.ts
// 职责：专门用于生成和颁发JWT

import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// --- 配置 ---
// 这个密钥必须与gatekeeper函数和ElectricSQL服务共享
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const hexPair = hex.substring(i * 2, i * 2 + 2);
    bytes[i] = parseInt(hexPair, 16);
  }
  return bytes;
}

// --- 主服务处理器 ---
Deno.serve(async (req) => {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 对于单用户应用，我们硬编码一个固定的用户ID
    const userId = 'user-123';
    
    const keyData = hexToBytes(AUTH_SECRET);
    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" },
      false, ["sign"] // 这个函数只需要签名的权限
    );

    // 创建一个包含用户ID和过期时间的JWT
    const payload = {
      user_id: userId,
      // 为了方便测试，可以设置一个较长的过期时间，例如24小时
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
      shape: {
        table: 'lists,tables,meta', // 或者根据实际需要设置
        columns: 'id,name,sort_order,is_hidden,modified'
      }
    };
    
    const token = await create({ alg: "HS256", typ: "JWT" }, payload, key);
    
    // 返回生成的令牌
    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Token generation error:", error);
    return new Response("Error generating token", { status: 500, headers: corsHeaders });
  }
});
