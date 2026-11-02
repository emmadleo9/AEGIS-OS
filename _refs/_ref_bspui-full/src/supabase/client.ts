import {
  createClient,
  type FunctionInvokeOptions,
} from "@supabase/supabase-js";
import type { Database } from "./types/database_types";
import type { IncomingMessage, OutgoingMessage } from "./types/message_types";
import type { IncomingStatus, OutgoingStatus } from "./types/status_types";

//===================================
// Shared types — mirrored from open-bsp-api/.../_shared/types/*.
// Re-exported here so existing `@/supabase/client` imports keep working.
//===================================

export * from "./types/whatsapp_webhook_payload_types";
export * from "./types/whatsapp_endpoint_types";
export * from "./types/whatsapp_template_types";
export * from "./types/whatsapp_webhook_message_types";
export * from "./types/instagram_webhook_payload_types";
export * from "./types/status_types";
export * from "./types/message_types";
export * from "./types/extra_types";
export * from "./types/ui_types";
export * from "./types/database_types";

//===================================
// Supabase client (UI-only)
//===================================

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
    },
  },
);

supabase.realtime.reconnectAfterMs = (attempt: number) => {
  return Math.min(10 * 1000, attempt * 1000);
};

/**
 * `functions.invoke` defaults its response body to `any` and types its failure
 * branch as `{ error: any }`, so every caller that destructures it inherits an
 * `any`. This is the one place that touches it: give it the body type you
 * expect, and get either that body or a thrown error.
 */
export async function invokeFunction<T>(
  name: string,
  options?: FunctionInvokeOptions,
): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- supabase-js types `error` as `any`
  const { data, error } = await supabase.functions.invoke<T>(name, options);

  if (error) throw error;

  return data;
}

export type Status = IncomingStatus & OutgoingStatus;
export type MessageTypes = IncomingMessage["type"] | OutgoingMessage["type"];
export type Draft = { text: string; timestamp: string };
