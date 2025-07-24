// lib/sync/tokenUtils.ts
/**
 * 统一的认证令牌管理工具
 * 用于获取和管理与后端服务通信所需的认证令牌
 */

let cachedToken: string | null = null;

/**
 * 获取认证令牌
 * 如果已缓存则返回缓存的令牌，否则从token-issuer获取新令牌
 */
export async function getAuthToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  try {
    console.log("Fetching new auth token from token-issuer function...");
    
    const tokenIssuerUrl = process.env.NEXT_PUBLIC_TOKEN_ISSUER_URL;
    if (!tokenIssuerUrl) {
      throw new Error("NEXT_PUBLIC_TOKEN_ISSUER_URL is not set.");
    }

    const response = await fetch(tokenIssuerUrl);
    if (!response.ok) {
      throw new Error(`获取令牌失败: ${response.status} ${response.statusText}`);
    }
    
    const { token } = await response.json();
    if (!token) {
      throw new Error('在响应中未找到令牌');
    }
    
    cachedToken = token;
    return token;
  } catch (error) {
    console.error("获取认证令牌时发生严重错误:", error);
    throw new Error(`无法获取认证令牌: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 使缓存的令牌失效
 * 在令牌过期或认证失败时调用
 */
export function invalidateToken(): void {
  console.log("Invalidating cached auth token.");
  cachedToken = null;
}