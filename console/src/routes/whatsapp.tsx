import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppCenter } from "@/pages/WhatsAppCenter";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsAppCenter,
});