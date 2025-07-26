// 使用官方推荐的jsonwebtoken库，简化JWT验证
import jwt from 'jsonwebtoken';
// --- 配置 ---
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
const ELECTRIC_URL = Deno.env.get("ELECTRIC_URL") || "http://localhost:5133";
// CORS配置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, electric-cursor',
  'Access-Control-Expose-Headers': 'electric-offset, electric-handle, electric-schema, electric-cursor'
};
// --- 辅助函数 ---
/**
 * 匹配 `GET /v1/shape` 请求
 */ function isGetShapeRequest(method, path) {
  return method === 'GET' && path.endsWith('/v1/shape');
}
/**
 * 验证JWT token - 使用官方简化方式
 */ function verifyAuthHeader(headers) {
  const auth_header = headers.get("Authorization");
  if (auth_header === null) {
    return [
      false,
      null
    ];
  }
  const token = auth_header.split("Bearer ")[1];
  if (!token) {
    return [
      false,
      null
    ];
  }
  try {
    // 使用简单的jwt验证，减少CPU消耗
    const claims = jwt.verify(token, AUTH_SECRET, {
      algorithms: [
        "HS256"
      ]
    });
    return [
      true,
      claims
    ];
  } catch (err) {
    console.warn("JWT verification failed:", err.message);
    return [
      false,
      null
    ];
  }
}
// --- 主服务处理器 ---
Deno.serve((req)=>{
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const url = new URL(req.url);
  // 检查是否为shape请求
  if (!isGetShapeRequest(req.method, url.pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: corsHeaders
    });
  }
  // JWT验证
  const [isValidJWT, claims] = verifyAuthHeader(req.headers);
  if (!isValidJWT) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders
    });
  }
  console.log("JWT验证通过，开始代理请求");
  // 构建ElectricSQL请求URL
  const shapeUrl = new URL(`${ELECTRIC_URL}/v1/shape`);
  shapeUrl.search = url.searchParams.toString();
  // 添加secret参数用于ElectricSQL认证
  const electricSecret = AUTH_SECRET;
  if (electricSecret) {
    shapeUrl.searchParams.set('secret', electricSecret);
  }
  console.log("代理到:", shapeUrl.toString());
  // 关键：直接返回fetch Promise，保持流式特性
  // 这样gatekeeper不会等待完整响应，避免长时间占用CPU
  return fetch(shapeUrl.toString(), {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${electricSecret}`,
      // 转发客户端的Accept头部
      ...req.headers.get('Accept') && {
        'Accept': req.headers.get('Accept')
      },
      // 转发ElectricSQL相关头部
      ...req.headers.get('electric-cursor') && {
        'electric-cursor': req.headers.get('electric-cursor')
      }
    }
  }).then((electricResponse)=>{
    console.log(`ElectricSQL响应状态: ${electricResponse.status}`);
    // 最小化的响应处理 - 只复制必要的头部
    const responseHeaders = new Headers();
    // 复制ElectricSQL的关键头部
    const electricHeaders = [
      'content-type',
      'electric-offset',
      'electric-handle',
      'electric-schema',
      'electric-cursor'
    ];
    electricHeaders.forEach((header)=>{
      const value = electricResponse.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });
    // 添加CORS头部
    Object.entries(corsHeaders).forEach(([key, value])=>{
      responseHeaders.set(key, value);
    });
    // 直接返回响应体流，保持流式特性
    return new Response(electricResponse.body, {
      status: electricResponse.status,
      headers: responseHeaders
    });
  }).catch((error)=>{
    console.error("代理请求失败:", error);
    return new Response(JSON.stringify({
      error: "Proxy request failed",
      message: error.message
    }), {
      status: 502,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  });
});
