import { createMiddleware } from "@tanstack/react-start";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./types";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  user: User;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function getServerSupabaseEnv() {
  const SUPABASE_URL =
    typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined;

  const SUPABASE_PUBLISHABLE_KEY =
    typeof process !== "undefined"
      ? process.env.SUPABASE_PUBLISHABLE_KEY
      : undefined;

  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
  }

  return {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  };
}

function createSupabaseFetch(
  supabaseKey: string,
  accessToken?: string | null,
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    } else if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

function createSupabaseAuthClient(accessToken?: string | null) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getServerSupabaseEnv();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY, accessToken),
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { supabase } = await import("@/integrations/supabase/client");

    const { data } = await supabase.auth.getSession();

    return next({
      sendContext: {
        supabaseAccessToken: data.session?.access_token ?? null,
      },
    });
  })
  .server(async ({ next, context }) => {
    const authContext = context as {
      supabaseAccessToken?: string | null;
    };

    const accessToken = authContext.supabaseAccessToken;

    if (!accessToken) {
      throw new Error("Unauthorized");
    }

    const supabase = createSupabaseAuthClient(accessToken);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw new Error("Unauthorized");
    }

    return next({
      context: {
        supabase,
        userId: user.id,
        user,
      } satisfies AuthContext,
    });
  });

let _supabaseAuth: SupabaseClient<Database> | undefined;

export const supabaseAuth = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    if (!_supabaseAuth) {
      _supabaseAuth = createSupabaseAuthClient();
    }

    return Reflect.get(_supabaseAuth, prop, receiver);
  },
});

export default supabaseAuth;
