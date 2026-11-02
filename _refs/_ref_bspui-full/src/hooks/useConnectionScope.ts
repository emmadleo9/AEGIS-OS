import { useState } from "react";
import { useCurrentAgent } from "@/queries/useAgents";

export type ConnectionScope = "organization" | "personal";

/**
 * Who a connection belongs to, on every service that has one.
 *
 * The API takes an `agent_id` when connecting: absent connects the
 * ORGANIZATION'S account — a shared inbox every member can see, and admin+ to
 * set up — while set connects a PERSONAL one, whose conversations are that
 * member's alone. Any member may connect their own; naming a colleague's is
 * admin+ and the UI does not offer it.
 *
 * The default is the organization's for an admin and personal for everyone
 * else, but only until a choice is made — derived rather than stored, because
 * the role arrives with a query and an initial state would keep whatever was
 * true before it landed.
 */
export function useConnectionScope() {
  const { data: agent } = useCurrentAgent();
  const [chosen, setChosen] = useState<ConnectionScope | null>(null);

  const isAdmin = ["admin", "owner"].includes(agent?.role || "");
  const scope: ConnectionScope =
    chosen ?? (isAdmin ? "organization" : "personal");

  return {
    scope,
    setScope: setChosen,
    isAdmin,
    /** What to send. Undefined is the organization's account. */
    agentId: scope === "personal" ? agent?.id : undefined,
    /** Whether this caller may connect at the chosen scope. */
    allowed: scope === "personal" ? !!agent?.id : isAdmin,
  };
}
