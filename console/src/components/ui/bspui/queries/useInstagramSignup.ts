import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeFunction, type OrganizationAddressRow } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Builds the Instagram Business Login authorize URL server-side (the client_id
 * and scopes live in the backend). `state` carries CSRF protection / the
 * onboarding token. The endpoint is public, so the anon key is enough — used by
 * both the in-app connect and the public onboarding-link flows.
 */
export async function getInstagramAuthorizeUrl(
  redirect_uri: string,
  state: string,
): Promise<string> {
  const url = new URL(`${FUNCTIONS_URL}/instagram-management/authorize-url`);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("state", state);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) throw new Error("Could not get Instagram authorize URL");

  const data = (await res.json()) as { url: string };
  return data.url;
}

export type InstagramSignupPayload = {
  code: string;
  redirect_uri: string;
  /** Connects the account as this member's own; absent is the organization's. */
  agent_id?: string;
};

export function useInstagramSignup() {
  const queryClient = useQueryClient();
  const organization_id = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (payload: InstagramSignupPayload) => {
      if (!organization_id) throw new Error("No active organization");

      return await invokeFunction<OrganizationAddressRow>(
        "instagram-management/signup",
        {
          method: "POST",
          body: { organization_id, ...payload },
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.addresses(organization_id),
      });
    },
  });
}

export function useInstagramDisconnect() {
  const queryClient = useQueryClient();
  const organization_id = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (payload: { ig_user_id: string }) => {
      if (!organization_id) throw new Error("No active organization");

      return await invokeFunction<unknown>("instagram-management/signup", {
        method: "DELETE",
        body: { organization_id, ...payload },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.addresses(organization_id),
      });
    },
  });
}
