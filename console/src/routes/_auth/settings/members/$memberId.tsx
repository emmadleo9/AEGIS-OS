import { createFileRoute, useNavigate } from "@tanstack/react-router";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import SectionFooter from "@/components/SectionFooter";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useAgent,
  useUpdateAgent,
  useDeleteAgent,
  useCurrentAgent,
  useCurrentAgents,
} from "@/queries/useAgents";
import useBoundStore from "@/stores/useBoundStore";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { HumanAgentRow, HumanAgentUpdate } from "@/supabase/client";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import { queryKeys } from "@/queries/queryKeys";

export const Route = createFileRoute("/_auth/settings/members/$memberId")({
  component: EditMember,
});

function EditMember() {
  const { memberId } = Route.useParams();
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: agent } = useAgent<HumanAgentRow>(memberId);
  const { data: allAgents } = useCurrentAgents(); // Fetch all agents to check for owners
  const { data: currentAgent } = useCurrentAgent();
  const isOwner = currentAgent?.role === "owner";
  const isMe = currentAgent?.id === memberId;
  const setActiveOrg = useBoundStore((state) => state.ui.setActiveOrg);
  const queryClient = useQueryClient();

  // Count owners to prevent deleting the last one
  const ownersCount =
    allAgents?.filter((a) => a.user_id !== null && a.role === "owner").length ||
    0;
  const isLastOwner = agent?.role === "owner" && ownersCount <= 1;

  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

  const onDelete = () => {
    deleteAgent.mutate(memberId, {
      onSuccess: () => {
        if (isMe) {
          // If the user deletes themself, invalidate organizations and redirect to conversations
          void queryClient.invalidateQueries({
            queryKey: queryKeys.organizations.all(),
          });
          setActiveOrg(null);
          void navigate({ to: "/conversations" });
        } else {
          void navigate({ to: "..", hash: (prevHash) => prevHash! });
        }
      },
    });
  };

  const {
    register,
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<HumanAgentUpdate>({
    values: agent,
  });

  if (!agent) return;

  return (
    <>
      <SectionHeader
        title={agent.name}
        onDelete={onDelete}
        deleteDisabled={
          (!isOwner && !isMe) ||
          (isOwner && isLastOwner && memberId === agent.id)
        } // Prevent deleting last owner
        deleteDisabledReason={
          isLastOwner
            ? t("No se puede eliminar al único propietario")
            : t("Requiere permisos de propietario")
        }
        deleteLoading={deleteAgent.isPending}
      />
      <SectionBody>
        <form
          id="member-form"
          onSubmit={handleSubmit((data) => updateAgent.mutate(data))}
        >
          <label>
            <div className="label">{t("Nombre")}</div>
            <input
              className="text"
              disabled={!isOwner && !isMe}
              placeholder={t("Nombre del miembro")}
              {...register("name", { required: true })}
            />
          </label>

          <SelectField
            name="role"
            control={control}
            label={t("Rol")}
            options={[
              { value: "member", label: t("Miembro") },
              { value: "admin", label: t("Administrador") },
              { value: "owner", label: t("Propietario") },
            ]}
            disabled={!isOwner}
            required
          />
        </form>
      </SectionBody>

      <SectionFooter>
        <Button
          form="member-form"
          type="submit"
          disabled={!isOwner && !isMe}
          invalid={!isValid || !isDirty}
          loading={updateAgent.isPending}
          disabledReason={t("Requiere permisos de propietario")}
          className="primary"
        >
          {t("Actualizar")}
        </Button>
      </SectionFooter>
    </>
  );
}
