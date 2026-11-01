import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction, type TemplateData } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";

export function useTemplates(organizationAddress?: string) {
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: ["templates", activeOrgId, organizationAddress],
    queryFn: async () => {
      if (!organizationAddress) return [];

      // Meta wraps the list in `{ data: [...] }`.
      const body = await invokeFunction<{ data?: TemplateData[] }>(
        "whatsapp-management/templates",
        {
          method: "PUT",
          body: {
            organization_id: activeOrgId,
            organization_address: organizationAddress,
          },
        },
      );

      return body?.data || [];
    },
    enabled: !!activeOrgId && !!organizationAddress,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      await invokeFunction<unknown>("whatsapp-management/templates", {
        method: "POST",
        body: {
          organization_id: activeOrgId,
          organization_address: organizationAddress,
          template,
        },
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      await invokeFunction<unknown>("whatsapp-management/templates", {
        method: "PATCH",
        body: {
          organization_id: activeOrgId,
          organization_address: organizationAddress,
          template,
        },
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      await invokeFunction<unknown>("whatsapp-management/templates", {
        method: "DELETE",
        body: {
          organization_id: activeOrgId,
          organization_address: organizationAddress,
          template,
        },
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}
