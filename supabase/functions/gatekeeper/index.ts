// 从Deno官方推荐的URL导入JWT库
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// --- 配置 ---
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
const ELECTRIC_URL = Deno.env.get("ELECTRIC_URL") || "http://localhost:5133"; // ElectricSQL服务的内部地址

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShapeDefinition {
  table: string;
  columns?: string;
  namespace?: string;
  where?: string;
}

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

async function verifyAuthHeader(headers: Headers): Promise<[boolean, any]> {
  const auth_header = headers.get("Authorization");

  if (auth_header === null) {
    return [false, null];
  }

  const token = auth_header.split("Bearer ")[1];
  if (!token) {
    return [false, null];
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

    const claims = await verify(token, key);
    return [true, claims];
  } catch (err) {
    console.error("JWT Verification FAILED!");
    console.error(`--> Secret Key Used: "${AUTH_SECRET}"`);
    console.error("--> Error Details:", err.message);
    return [false, null];
  }
}

function matchesDefinition(shape: ShapeDefinition, params: URLSearchParams): boolean {
  if (shape === null || !shape.hasOwnProperty('table')) {
    return false;
  }

  const table = shape.namespace !== null && shape.namespace !== undefined
    ? `${shape.namespace}.${shape.table}`
    : shape.table;

  if (table === null || table !== params.get('table')) {
    return false;
  }

  if ((shape.where || null) !== params.get('where')) {
    return false;
  }

  if ((shape.columns || null) !== params.get('columns')) {
    return false;
  }

  return true;
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

  const [isValidJWT, claims] = await verifyAuthHeader(req.headers);
  if (!isValidJWT) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  if (!matchesDefinition(claims.shape, url.searchParams)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const electricResponse = await fetch(`${ELECTRIC_URL}/v1/shape${url.search}`, { headers: req.headers });

    const responseHeaders = new Headers(electricResponse.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(electricResponse.body, {
      status: electricResponse.status,
      statusText: electricResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy fetch error:", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
