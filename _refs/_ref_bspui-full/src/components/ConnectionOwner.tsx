import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgent, useCurrentAgents } from "@/queries/useAgents";

/**
 * Marks a USER-SCOPED connection in a list of an organization's accounts.
 *
 * Everyone sees every address row (05-01), so a colleague's personal number
 * appears in the same list as the shared inbox and needs saying apart — its
 * conversations are theirs alone, and only they and an admin can disconnect
 * it. The organization's own accounts carry no agent_id and get no mark.
 */
export default function ConnectionOwner({
  agentId,
}: {
  agentId: string | null;
}) {
  const { translate: t } = useTranslation();
  const { data: agent } = useCurrentAgent();
  const { data: agents } = useCurrentAgents();

  if (!agentId) return null;

  const owner =
    agentId === agent?.id
      ? undefined
      : agents?.find((a) => a.id === agentId)?.name;

  return (
    <>
      {" · "}
      {t("Personal")}
      {owner && `: ${owner}`}
    </>
  );
}
