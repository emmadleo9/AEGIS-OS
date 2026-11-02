import { createFileRoute, useNavigate } from "@tanstack/react-router";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { useCreateInvitation, useCurrentAgent } from "@/queries/useAgents";
import { type InvitationInsert } from "@/supabase/client";
import { useForm } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import SectionFooter from "@/components/SectionFooter";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";

export const Route = createFileRoute("/_auth/settings/members/new")({
  component: AddMember,
});

function AddMember() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const createInvitation = useCreateInvitation();
  const { data: agent } = useCurrentAgent();
  const isOwner = agent?.role === "owner";

  const {
    register,
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<Omit<InvitationInsert, "organization_id">>({
    defaultValues: {
      role: "member",
    },
  });

  return (
    <>
      <SectionHeader title={t("Agregar miembro")} />

      <SectionBody>
        <form
          id="create-member-form"
          onSubmit={handleSubmit((data) =>
            createInvitation.mutate(
              { email: data.email, role: data.role },
              {
                onSuccess: () =>
                  navigate({
                    to: "/settings/members",
                    hash: (prevHash) => prevHash!,
                  }),
              },
            ),
          )}
        >
          <fieldset disabled={!isOwner} className="contents">
            <p>
              {t(
                "Los propietarios tienen control total, los administradores gestionan configuraciones y los miembros responden a las conversaciones.",
              )}
            </p>

            <SelectField
              name="role"
              control={control}
              label={t("Rol")}
              options={[
                { value: "member", label: t("Miembro") },
                { value: "admin", label: t("Administrador") },
                { value: "owner", label: t("Propietario") },
              ]}
              required
            />

            <label>
              <div className="label">{t("Correo electrónico")}</div>
              <input
                type="email"
                className="text"
                placeholder={t("usuario@ejemplo.com")}
                {...register("email", {
                  required: true,
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "Invalid email address",
                  },
                })}
              />
            </label>
          </fieldset>
        </form>
      </SectionBody>

      <SectionFooter>
        <Button
          form="create-member-form"
          type="submit"
          disabled={!isOwner}
          invalid={!isValid || !isDirty}
          loading={createInvitation.isPending}
          disabledReason={t("Requiere permisos de propietario")}
          className="primary"
        >
          {t("Invitar")}
        </Button>
      </SectionFooter>
    </>
  );
}
