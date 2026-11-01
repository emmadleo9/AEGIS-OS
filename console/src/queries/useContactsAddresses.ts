import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ContactAddressInsert,
  type ContactAddressRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";
import type { Database } from "@/supabase/db_types";

type Service = Database["public"]["Enums"]["service"];

// A contacts_addresses row is an entry in ONE connection's address book: the
// PK is (organization_id, organization_address, service, address), so every
// lookup names the connection too. Its display name resolves from extra via
// contactName() — there is no contacts table to join.
export function useContactAddress(
  orgAddress: string | null | undefined,
  service: Service | null | undefined,
  address: string | null | undefined,
) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.contacts.addressDetail(
      orgId,
      orgAddress,
      service,
      address,
    ),
    queryFn: async () =>
      await supabase
        .from("contacts_addresses")
        .select()
        .eq("organization_id", orgId!)
        .eq("organization_address", orgAddress!)
        .eq("service", service!)
        .eq("address", address!)
        .maybeSingle()
        .throwOnError(),
    enabled: !!userId && !!orgId && !!orgAddress && !!service && !!address,
    select: (data) => data.data,
    experimental_prefetchInRender: true,
  });
}

export function useContactsAddresses() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.contacts.all(orgId),
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: ContactAddressRow[] = [];
      let offset = 0;

      while (true) {
        const { data: page } = await supabase
          .from("contacts_addresses")
          .select()
          .eq("organization_id", orgId!)
          .order("address", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
          .throwOnError();

        allData = [...allData, ...page];
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      return { data: allData };
    },
    enabled: !!userId && !!orgId,
    select: (data) => data.data,
  });
}

export function useCreateContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: Omit<ContactAddressInsert, "organization_id">) => {
      if (!orgId) throw new Error("No active organization");

      const { data: row } = await supabase
        .from("contacts_addresses")
        .insert({ ...data, organization_id: orgId })
        .select()
        .single()
        .throwOnError();

      return row;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
    },
  });
}

// Only non-synced entries are the member's to write: a synced one mirrors the
// service's address book and RLS refuses the update.
export function useUpdateContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (
      data: Pick<
        ContactAddressRow,
        "organization_address" | "service" | "address"
      > &
        Pick<ContactAddressInsert, "extra" | "status">,
    ) => {
      if (!orgId) throw new Error("No active organization");

      const { organization_address, service, address, ...patch } = data;

      const { data: row } = await supabase
        .from("contacts_addresses")
        .update(patch)
        .eq("organization_id", orgId)
        .eq("organization_address", organization_address)
        .eq("service", service)
        .eq("address", address)
        .select()
        .single()
        .throwOnError();

      return row;
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
      queryClient.setQueryData(
        queryKeys.contacts.addressDetail(
          orgId,
          row.organization_address,
          row.service,
          row.address,
        ),
        { data: row },
      );
    },
  });
}

export function useDeleteContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (
      data: Pick<
        ContactAddressRow,
        "organization_address" | "service" | "address"
      >,
    ) => {
      if (!orgId) throw new Error("No active organization");

      await supabase
        .from("contacts_addresses")
        .delete()
        .eq("organization_id", orgId)
        .eq("organization_address", data.organization_address)
        .eq("service", data.service)
        .eq("address", data.address)
        .throwOnError();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
    },
  });
}
