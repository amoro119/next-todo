// 从Deno官方推荐的URL导入JWT库
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// --- 配置 ---
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

// supabase/functions/gatekeeper/index.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, electric-cursor',
  // 添加 ElectricSQL 头部到允许列表
  'Access-Control-Expose-Headers': 'electric-offset, electric-handle, electric-schema, electric-cursor'
};

// --- 辅助函数 ---

/**
 * 将十六进制字符串正确地解析为Uint8Array字节数组。
 * @param hex 十六进制字符串
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const hexPair = hex.substring(i * 2, i * 2 + 2);
    bytes[i] = parseInt(hexPair, 16);
  }
  return bytes;
}

function isGetShapeRequest(method: string, path: string): boolean {
  return method === 'GET' && path.endsWith('/v1/shape');
}

async function verifyAuthHeader(headers: Headers): Promise<[boolean]> {
  const auth_header = headers.get("Authorization");

  if (auth_header === null) {
    return [false];
  }

  const token = auth_header.split("Bearer ")[1];
  if (!token) {
    return [false];
  }

  try {
    // **最终修正**: 十六进制字符串密钥必须被正确解析为字节数组。
    const keyData = hexToBytes(AUTH_SECRET);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData, // 使用正确解析的字节
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    await verify(token, key);
    return [true];
  } catch (err) {
    console.error("JWT Verification FAILED!");
    console.error(`--> Secret Key Used: "${AUTH_SECRET}"`);
    console.error("--> Error Details:", err.message);
    return [false];
  }
}

// --- 主服务处理器 ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (!isGetShapeRequest(req.method, url.pathname)) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const [isValidJWT] = await verifyAuthHeader(req.headers);
  console.log("JWT verification result:", { isValidJWT });
  
  if (!isValidJWT) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  console.log("JWT is valid, fetching real data");

  try {
    // 直接代理 ElectricSQL Proxy 的 shape log
    const electricUrl = Deno.env.get("ELECTRIC_URL") || "http://localhost:5133";
    const electricSecret = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
    const shapeUrl = new URL(`${electricUrl}/v1/shape`);
    shapeUrl.search = url.searchParams.toString();
    if (electricSecret) {
      shapeUrl.searchParams.set('secret', electricSecret);
    }
    console.log("Gatekeeper ElectricSQL Proxy Forwarding:");
    console.log("electricSecret:", electricSecret);
    console.log("shapeUrl:", shapeUrl.toString());
    // 转发认证头（如 Authorization）
    const proxyHeaders = new Headers();
    if (electricSecret) {
      proxyHeaders.set('Authorization', `Bearer ${electricSecret}`);
    }
    console.log("Proxy Headers:", Array.from(proxyHeaders.entries()));
    if (req.headers.get('Authorization')) {
      proxyHeaders.set('X-Client-Authorization', req.headers.get('Authorization'));
    }
    // 你可以根据需要转发更多头部
    const electricResp = await fetch(shapeUrl.toString(), {
      headers: proxyHeaders
    });
    const body = await electricResp.body;
    // 直接转发响应，保留原始 headers
    const respHeaders = new Headers(electricResp.headers);
    // 你可以根据需要添加 CORS 头
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    respHeaders.set('Access-control-allow-headers', 'authorization, x-client-info, apikey, content-type, electric-cursor');
    respHeaders.set('Access-Control-Expose-Headers', 'electric-offset, electric-handle, electric-schema, electric-cursor');
    return new Response(body, {
      status: electricResp.status,
      headers: respHeaders
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});