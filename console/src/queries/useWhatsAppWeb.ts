import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

// Backend contract: whatsapp-web-management edge function (whatsmeow bridge).
// All routes take the user JWT (supabase.functions.invoke attaches it). Pairing
// and disconnecting the ORGANIZATION'S number are admin+; a member does both
// for a personal one — the address row whose agent_id is theirs.
const FN = "whatsapp-web-management";

export type WebSessionStatus = "pending" | "paired" | "error";

export type StartSessionResult = {
  session_id: string;
  status: WebSessionStatus;
  qr_code?: string; // QR flow
  pairing_code?: string; // code flow
};

export type PendingSessionResult = StartSessionResult & {
  address?: string; // set once status = "paired"
  error?: string; // set when status = "error"
};

export type WebHealth = {
  address: string;
  connected: boolean;
  logged_in: boolean;
};

async function invoke<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<T> {
  const data = await invokeFunction<T>(`${FN}/${path}`, {
    method,
    ...(body ? { body } : {}),
  });

  if (!data) throw new Error(`Empty response from ${path}`);

  return data;
}

// 3.1 Start pairing — QR (no phone) or code (with phone). `agent_id` makes the
// number personal; absent pairs the organization's. The bridge stores it in the
// session mapping and echoes it back on every connected event, so a reconnect
// cannot quietly turn a personal number into a shared one.
export function useStartWhatsAppWebSession() {
  const organization_id = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (payload: {
      phone_number?: string;
      agent_id?: string;
    }) => {
      if (!organization_id) throw new Error("No active organization");

      return invoke<StartSessionResult>("sessions", "POST", {
        organization_id,
        ...payload,
      });
    },
  });
}

// 3.2 Poll a pending session every ~4s while the pairing dialog is open. The
// backend upserts the organizations_addresses row on "paired" (arrives via
// Realtime), so callers just stop polling and close.
export function usePendingWhatsAppWebSession(
  sessionId: string | null,
  enabled = true,
) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.whatsappWeb.pendingSession(orgId, sessionId),
    queryFn: () =>
      invoke<PendingSessionResult>(
        `sessions/pending/${sessionId}?organization_id=${orgId}`,
        "GET",
      ),
    enabled: !!orgId && !!sessionId && enabled,
    // Keep polling only while still pending.
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 4000 : false,
    gcTime: 0,
    staleTime: 0,
  });
}

// 3.3 Live socket state from the bridge for a connected channel (any member).
export function useWhatsAppWebHealth(address: string | null | undefined) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.whatsappWeb.health(orgId, address),
    queryFn: () =>
      invoke<WebHealth>(`sessions/${address}?organization_id=${orgId}`, "GET"),
    enabled: !!orgId && !!address,
    refetchInterval: 15000,
  });
}

// 3.4 Log the device out, delete the session, mark the row disconnected. Owner.
export function useDisconnectWhatsAppWeb() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (address: string) => {
      if (!orgId) throw new Error("No active organization");

      return invoke<unknown>(
        `sessions/${address}?organization_id=${orgId}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.addresses(orgId),
      });
    },
  });
}
