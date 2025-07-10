// 从Deno官方推荐的URL导入JWT库
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// --- 配置 ---
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
const ELECTRIC_URL = Deno.env.get("ELECTRIC_URL") || "http://localhost:5133";

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');// ElectricSQL服务的内部地址

// supabase/functions/gatekeeper/index.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  // 添加 ElectricSQL 头部到允许列表
  'Access-Control-Expose-Headers': 'electric-offset, electric-handle, electric-schema'
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

function matchesDefinition(shape: ShapeDefinition | undefined, params: URLSearchParams): boolean {
  // 安全的 undefined 检查
  if (!shape || typeof shape !== 'object' || !shape.hasOwnProperty('table')) {
    console.log("Shape validation failed: invalid shape object", shape);
    return false;
  }

  const table = shape.namespace !== null && shape.namespace !== undefined
    ? `${shape.namespace}.${shape.table}`
    : shape.table;

  if (table === null || table !== params.get('table')) {
    console.log("Shape validation failed: table mismatch", { shapeTable: table, paramTable: params.get('table') });
    return false;
  }

  if ((shape.where || null) !== params.get('where')) {
    console.log("Shape validation failed: where mismatch");
    return false;
  }

  if ((shape.columns || null) !== params.get('columns')) {
    console.log("Shape validation failed: columns mismatch");
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
  console.log("JWT verification result:", { isValidJWT });
  
  if (!isValidJWT) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  console.log("JWT is valid, fetching real data");

  try {
    const table = url.searchParams.get('table');
    const columns = url.searchParams.get('columns')?.split(',') || [];
    
    // 从 Supabase 数据库获取真实数据
    const supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!);
    
    const { data, error } = await supabaseClient
      .from(table!)
      .select(columns.join(','));
    
    if (error) {
      console.error("Database error:", error);
      return new Response("Database error", { status: 500, headers: corsHeaders });
    }

    const responseData = {
      table,
      columns,
      offset: 0,
      handle: `real-handle-${table}-${Date.now()}`,
      schema: {
        table,
        columns,
        primaryKey: ['id']
      },
      hasMore: false,
      rows: (data || []).map(row =>
        columns.map(col => row[col])
      )
    };


    console.log("Returning ElectricSQL-compatible data:", {
      table,
      columns,
      dataCount: data?.length || 0,
      sampleData: data?.[0] || null,
      responseFormat: responseData
    });

    // 创建响应头
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('electric-offset', '0');
    headers.set('electric-handle', `real-handle-${table}-${Date.now()}`);
    headers.set('electric-schema', JSON.stringify({
      table: table,
      columns: columns,
      primaryKey: ['id']
    }));
    
    // 添加 CORS 头
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-control-allow-headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Expose-Headers', 'electric-offset, electric-handle, electric-schema');

    console.log("Returning real data:", {
      table,
      columns,
      dataCount: data?.length || 0
    });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: headers
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});