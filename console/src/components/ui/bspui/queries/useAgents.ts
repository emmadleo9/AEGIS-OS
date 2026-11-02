import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AgentInsert,
  type AgentRow,
  type AgentUpdate,
  type HumanAgentRow,
  type InvitationInsert,
  type InvitationRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { type CachedResponse, queryKeys } from "./queryKeys";

export function useAgent<T = AgentRow>(id: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.agents.detail(orgId, id),
    queryFn: async () =>
      await supabase
        .from("agents")
        .select()
        .eq("id", id)
        .throwOnError()
        .single(),
    enabled: !!userId && !!orgId,
    select: (data) => data.data as T,
    experimental_prefetchInRender: true,
  });
}

// The signed-in user's own pending invitations, across organizations —
// invitations are their own table now, keyed by email. RLS lets members also
// see their orgs' invitations, so filter to the caller's email explicitly.
export function useInvitations() {
  const email = useBoundStore((state) => state.ui.user?.email);

  return useQuery({
    queryKey: queryKeys.invitations.mine(),
    queryFn: async () =>
      await supabase
        .from("invitations")
        .select()
        .eq("status", "pending")
        .ilike("email", email!)
        .throwOnError(),
    enabled: !!email,
    select: (data) => data.data as InvitationRow[],
    experimental_prefetchInRender: true,
  });
}

// The active organization's pending invitations (members list).
export function useOrgInvitations() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.invitations.all(orgId),
    queryFn: async () =>
      await supabase
        .from("invitations")
        .select()
        .eq("organization_id", orgId!)
        .eq("status", "pending")
        .throwOnError(),
    enabled: !!orgId,
    select: (data) => data.data as InvitationRow[],
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: Omit<InvitationInsert, "organization_id">) => {
      if (!orgId) throw new Error("No active organization");

      const { data: invitation } = await supabase
        .from("invitations")
        .insert({ ...data, organization_id: orgId })
        .select()
        .single()
        .throwOnError();

      return invitation;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invitations.all(orgId),
      });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (invitationId: string) => {
      await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId)
        .throwOnError();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invitations.all(orgId),
      });
    },
  });
}

// Answering an invitation crosses the membership boundary, so it goes through
// the accept_invitation / reject_invitation RPCs — the invitee holds SELECT on
// invitations and nothing else.
export function useAnswerInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invitationId,
      answer,
    }: {
      invitationId: string;
      answer: "accepted" | "rejected";
    }) => {
      if (answer === "accepted") {
        await supabase
          .rpc("accept_invitation", { invitation_id: invitationId })
          .throwOnError();
      } else {
        await supabase
          .rpc("reject_invitation", { invitation_id: invitationId })
          .throwOnError();
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invitations.mine(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.all(),
      });
    },
  });
}

export function useCurrentAgent() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.agents.current(orgId),
    queryFn: async () =>
      await supabase
        .from("agents")
        .select()
        .eq("organization_id", orgId!)
        .eq("user_id", userId!)
        .is("deleted_at", null)
        .throwOnError()
        .single(),
    enabled: !!userId && !!orgId,
    select: (data) => data.data as HumanAgentRow,
  });
}

export function useCurrentAgents() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.agents.all(orgId),
    queryFn: async () =>
      await supabase
        .from("agents")
        .select()
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .throwOnError(),
    enabled: !!userId && !!orgId,
    select: (data) => data.data,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: AgentInsert) => {
      if (!orgId) throw new Error("No active organization");

      const { data: agent } = await supabase
        .from("agents")
        .insert({ ...data, organization_id: orgId })
        .select()
        .single()
        .throwOnError();

      return agent;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(orgId),
      });
      queryClient.setQueryData<CachedResponse<AgentRow>>(
        queryKeys.agents.detail(orgId, data.id),
        (old) => (old ? { ...old, data } : { data, error: null }),
      );
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AgentUpdate) => {
      // No active organization check because invitations don't have an organization_id
      if (!data.id) throw new Error("No agent id");

      const { data: agent } = await supabase
        .from("agents")
        .update(data)
        .eq("id", data.id)
        .select()
        .single()
        .throwOnError();

      return agent;
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(data.organization_id),
      });
      // Use function updater to preserve the Supabase response wrapper.
      // queryFn returns { data: AgentRow, ... } and select does data.data,
      // so setting a raw AgentRow would make select return undefined.
      queryClient.setQueryData<CachedResponse<AgentRow>>(
        queryKeys.agents.detail(data.organization_id, variables.id),
        (old) => (old ? { ...old, data } : old),
      );
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No active organization");

      await supabase.from("agents").delete().eq("id", id).throwOnError();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(orgId),
      });
    },
  });
}
