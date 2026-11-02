import useBoundStore from "@/stores/useBoundStore";
import {
  type ConversationAgentExtra,
  type ConversationInsert,
  type ConversationRow,
  supabase,
} from "@/supabase/client";

function pushConversationToStore(record: ConversationInsert) {
  // TODO: optimistic insert lacks some fields that the store considers as present - cabra 2024/07/28
  useBoundStore.getState().chat.pushConversations([record as ConversationRow]);
}

// Only `local` conversations may be inserted directly: on every other service
// the conversation row is minted by the first message's insert trigger, so
// this is a no-op there.
//
// Safe to call twice only because openLocalDirect below guarantees the roster
// is not already taken — the id here is ours, but the IDENTITY is the address.
export async function pushConversationToDb(record: ConversationInsert) {
  if (record.service !== "local") return;

  const insertQuery = await supabase.from("conversations").insert(record);

  if (insertQuery.error) {
    throw insertQuery.error;
  }
}

export function startConversation(conv: ConversationInsert): string {
  const id = crypto.randomUUID();

  pushConversationToStore({ ...conv, id });

  return id;
}

/**
 * Opens the `local` direct between these people, creating it only if there is
 * not one already. Returns the conversation id to navigate to.
 *
 * A local direct is identified by its ROSTER, not by the id we mint:
 * before_insert_on_conversations canonicalises the address to the sorted agent
 * ids and conversations_identity_idx is unique on (organization_id,
 * organization_address, service, address). So minting an id every time asks
 * for a SECOND conversation between the same two people, and the index refuses
 * it — which is what "duplicate key value violates conversations_identity_idx"
 * was: the button worked exactly once per agent.
 *
 * Sorting here agrees with the trigger's `order by a.id`: agent ids render as
 * lowercase hex, where lexicographic order is byte order.
 *
 * The store answers first, the DB second. Both are needed — the initial fetch
 * is windowed (init_data, by recency), so a room nobody has written in lately
 * is perfectly visible and simply not loaded.
 */
export async function openLocalDirect(conv: {
  organization_id: string;
  organization_address: string;
  roster: string[];
  name?: string | null;
}): Promise<string> {
  const address = [...conv.roster].sort().join(":");

  for (const loaded of useBoundStore.getState().chat.conversations.values()) {
    if (
      loaded.service === "local" &&
      loaded.organization_id === conv.organization_id &&
      loaded.organization_address === conv.organization_address &&
      loaded.address === address
    ) {
      return loaded.id;
    }
  }

  const { data: existing, error } = await supabase
    .from("conversations")
    .select()
    .eq("organization_id", conv.organization_id)
    .eq("organization_address", conv.organization_address)
    .eq("service", "local")
    .eq("address", address)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    // Outside the window, so the store has never seen it.
    pushConversationToStore(existing);

    return existing.id;
  }

  return startConversation({
    organization_id: conv.organization_id,
    organization_address: conv.organization_address,
    service: "local",
    address,
    name: conv.name,
  });
}

// Per-member conversation state (archived/pinned/draft) lives on the caller's
// own conversations_agents row — members hold no UPDATE on conversations
// outside `local`. Upserted so the row is created the first time a preference
// is set on a conversation the member is not a participant of.
//
// ROUGH EDGE — this upsert is REFUSED on a restricted conversation, so drafts,
// archive and pin silently do nothing on a `local` direct (the agent DM, the
// test conversation) or a Slack chat our bot is not in.
//
// Postgres evaluates the INSERT policy's WITH CHECK even when ON CONFLICT takes
// the UPDATE path, and 05-12 only lets a member CREATE a membership row on a
// conversation that is visible WITHOUT it — a row there GRANTS visibility, so
// creating one at will would be a way into any private chat. A restricted
// conversation is visible only BY participating, so the with-check fails and
// the statement errors even though the member already owns the row it meant to
// update. Splitting it into UPDATE-then-INSERT sidesteps that, but this table
// is the wrong home for UI state either way: a dedicated table is coming, and
// it can carry its own policy instead of borrowing one written for
// participation.
export const updateConvExtra = async (
  conversation: ConversationRow,
  extra: ConversationAgentExtra,
) => {
  const { ownAgentId, setMembershipExtra } = useBoundStore.getState().chat;

  if (!ownAgentId) {
    throw new Error("No agent for the current user in this organization");
  }

  setMembershipExtra(conversation.id, extra);

  const { error } = await supabase.from("conversations_agents").upsert(
    {
      organization_id: conversation.organization_id,
      service: conversation.service,
      organization_address: conversation.organization_address,
      conversation_id: conversation.id,
      agent_id: ownAgentId,
      extra,
    },
    { onConflict: "conversation_id,agent_id" },
  );

  if (error) {
    throw error;
  }
};

export async function saveDraft(conv: ConversationRow, text: string | null) {
  await updateConvExtra(conv, {
    draft: text
      ? {
          text,
          timestamp: new Date().toISOString(),
        }
      : null,
  });
}
