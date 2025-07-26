// supabase/functions/token-issuer/index.ts
// 职责：专门用于生成和颁发JWT
import jwt from 'jsonwebtoken';
// --- 配置 ---
// 这个密钥必须与gatekeeper函数和ElectricSQL服务共享
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type'
};
// Remove hexToBytes function as we'll use jsonwebtoken directly
// --- 主服务处理器 ---
Deno.serve(async (req)=>{
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 对于单用户应用，我们硬编码一个固定的用户ID
    const userId = 'user-123';
    // 创建一个包含用户ID和过期时间的JWT
    // 支持多个表的访问权限
    const payload = {
      user_id: userId,
      // 为了方便测试，可以设置一个较长的过期时间，例如24小时
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      // 允许访问所有表，不限制具体的shape定义
      shape: {
        table: '*',
        columns: '*' // 通配符表示允许访问所有列
      }
    };
    const token = jwt.sign(payload, AUTH_SECRET, {
      algorithm: 'HS256'
    });
    console.log("Token generated successfully:", {
      userId: payload.user_id,
      exp: payload.exp,
      shape: payload.shape,
      tokenPrefix: token.substring(0, 20) + "..."
    });
    // 返回生成的令牌
    return new Response(JSON.stringify({
      token
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return new Response("Error generating token", {
      status: 500,
      headers: corsHeaders
    });
  }
});
