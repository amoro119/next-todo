import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export interface AuthResult {
  user: { id: string; email?: string } | null;
  supabase: any;
  isService: boolean;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function verifyAuth(authHeader: string): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openClawApiKey = Deno.env.get("OPENCLAW_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Unauthorized: Supabase env not configured");
  }

  // Extract token from Bearer header
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    throw new Error("Unauthorized: Invalid Authorization format");
  }
  
  const token = match[1].trim();

  // Public anon/publishable keys are never service credentials. OpenClaw uses
  // an independently rotatable secret while database access retains anon-role
  // permissions for the project's current shared-data deployment model.
  const apiKeyMatches = Boolean(openClawApiKey) && timingSafeEqual(token, openClawApiKey!);
  console.info(JSON.stringify({
    event: "openclaw_auth_check",
    apiKeyConfigured: Boolean(openClawApiKey),
    apiKeyMatches,
    serverKeyHasOuterWhitespace: openClawApiKey ? openClawApiKey !== openClawApiKey.trim() : false,
    tokenLooksLikeJwt: token.split(".").length === 3,
  }));
  if (apiKeyMatches) {
    return {
      user: null,
      supabase: createClient(supabaseUrl, supabaseAnonKey),
      isService: true,
    };
  }

  // Interactive callers may still authenticate with a real Supabase user JWT.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Otherwise, try to validate as user JWT
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) console.warn(JSON.stringify({ event: "openclaw_auth_user_rejected", status: error.status, code: error.code }));
    if (user) {
      return {
        user: { id: user.id, email: user.email },
        supabase,
        isService: false,
      };
    }
  } catch {
    console.warn(JSON.stringify({ event: "openclaw_auth_user_exception" }));
    // getUser() failed, token is invalid
  }

  // Invalid token
  throw new Error("Unauthorized: Invalid token");
}

export function authError(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
