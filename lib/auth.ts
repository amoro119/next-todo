// lib/auth.ts
import { Mutex } from 'async-mutex';

let cachedToken: string | null = null;
let tokenPromise: Promise<string> | null = null;
const mutex = new Mutex();

const TOKEN_ISSUER_URL = process.env.NEXT_PUBLIC_TOKEN_ISSUER_URL;

/**
 * 从 Supabase Edge Function 获取新的认证令牌。
 * 这是一个内部函数，外部应使用 getAuthToken。
 */
async function fetchNewToken(): Promise<string> {
  if (!TOKEN_ISSUER_URL) {
    throw new Error("NEXT_PUBLIC_TOKEN_ISSUER_URL is not set.");
  }

  console.log("Fetching new ElectricSQL auth token...");
  const response = await fetch(TOKEN_ISSUER_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch Electric token: ${response.status} ${response.statusText}`);
  }

  const { token } = await response.json();
  if (!token) {
    throw new Error('Token not found in response');
  }

  return token;
}

/**
 * 获取用于 ElectricSQL 同步的认证令牌。
 * 这个函数通过使用 Mutex 和 Promise 缓存来防止竞争条件，
 * 确保同一时间只有一个令牌请求正在进行。
 *
 * @returns {Promise<string>} 解析为认证令牌的 Promise。
 */
export async function getAuthToken(): Promise<string> {
  // 首先，快速检查是否有缓存的令牌，避免不必要的锁争用
  if (cachedToken) {
    return cachedToken;
  }

  // 使用互斥锁来确保只有一个请求可以进入临界区
  const release = await mutex.acquire();
  try {
    // 再次检查，因为在等待锁的时候，可能已经有另一个请求获取了令牌
    if (cachedToken) {
      return cachedToken;
    }

    // 如果当前有正在进行的令牌请求，则等待它完成
    if (tokenPromise) {
      return tokenPromise;
    }

    // 创建一个新的令牌请求 Promise
    tokenPromise = fetchNewToken();

    // 等待 Promise 完成
    const token = await tokenPromise;

    // 缓存令牌
    cachedToken = token;
    console.log("ElectricSQL auth token fetched and cached.");
      
    console.log(cachedToken)

    return token;
  } catch (error) {
    console.error("Critical error fetching Electric token:", error);
    // 在出错时，清除缓存和 Promise，以便下次可以重试
    invalidateToken();
    throw error;
  } finally {
    // 清除 Promise 引用并释放锁
    tokenPromise = null;
    release();
  }
}

/**
 * 使缓存的认证令牌失效。
 * 当令牌验证失败或需要强制刷新时调用。
 */
export function invalidateToken(): void {
  console.log("Invalidating cached Electric token.");
  cachedToken = null;
}

/**
 * 获取当前缓存的令牌（非异步）。
 * @returns {string | null} 当前缓存的令牌，如果没有则为 null。
 */
export function getCachedAuthToken(): string | null {
  return cachedToken;
}