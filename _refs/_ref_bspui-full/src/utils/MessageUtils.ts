import {
  type ConversationRow,
  type IncomingMessage,
  type InternalMessage,
  type MessageInsert,
  type MessageRow,
  type OutgoingMessage,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";

export function newMessage(
  conv: ConversationRow,
  content: OutgoingMessage | IncomingMessage | InternalMessage,
  agentId?: string,
  file?: File,
): MessageInsert {
  // If a file is provided, update the FilePart with file metadata
  if (file && content.type === "file") {
    const fileUri = `internal://media/organizations/${conv.organization_id}/attachments/${crypto.randomUUID()}`;

    content.file = {
      ...content.file,
      uri: fileUri,
      mime_type: file.type,
      size: file.size,
      name: file.name,
    };
  }

  // TypeScript needs help with the union types, so we use type assertions
  return {
    id: crypto.randomUUID(),
    organization_id: conv.organization_id,
    // A conversation that never hit the DB (no updated_at) cannot be named on
    // an external service — its row is minted by this very message's insert
    // trigger from the addressing below. `local` conversations are inserted
    // directly, so their id is valid.
    conversation_id:
      conv.updated_at || conv.service === "local" ? conv.id : undefined,
    service: conv.service,
    organization_address: conv.organization_address,
    // The peer the conversation is with — groups included. The UI only ever
    // authors on our own side, so sender_address is always null: that IS what
    // makes the row outgoing now that `direction` is gone.
    conversation_address: conv.address,
    sender_address: null,
    content,
    agent_id: agentId || null,
  } as MessageInsert;
}

export function pushMessageToStore(record: MessageInsert) {
  // Let's provide a temporary timestamp so the message can be sorted.
  // We do not trust the client's time for setting the `timestamp` and `updated_at` fields. That's why.
  const now = new Date().toISOString();

  // Create the optimistic record with temporary values
  const optimisticRecord = {
    ...record,
    timestamp: now,
    created_at: now,
    updated_at: now, // important because of timestamp <= updated_at filter in chatSlice.ts
    status: { pending: now },
  };

  // TODO: optimistic insert (MessageInsert) lacks some fields that the store considers as present (MessageRow) - cabra 2024/07/28
  useBoundStore.getState().chat.pushMessages([optimisticRecord as MessageRow]);
}

export async function pushMessageToDb(
  record: MessageInsert,
  ignoreDuplicates = true,
) {
  const insertQuery = await supabase.from("messages").upsert(record, {
    ignoreDuplicates,
  });

  if (insertQuery.error) {
    throw insertQuery.error;
  }
}
