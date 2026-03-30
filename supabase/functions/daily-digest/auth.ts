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

export async function verifyAuth(authHeader: string): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Unauthorized: Supabase env not configured");
  }

  // Extract token from Bearer header
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    throw new Error("Unauthorized: Invalid Authorization format");
  }
  
  const token = match[1].trim();

  // Create Supabase client with the provided token in Authorization header
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // If token matches Anon Key, allow as service call
  // This is for OpenClaw and other backend services
  if (token === supabaseAnonKey) {
    return {
      user: null,
      supabase,
      isService: true,
    };
  }

  // Otherwise, try to validate as user JWT
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return {
        user: { id: user.id, email: user.email },
        supabase,
        isService: false,
      };
    }
  } catch {
    // getUser() failed, token is invalid
  }

  // Invalid token
  throw new Error("Unauthorized: Invalid token");
}

export function authError(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
