import { createFileRoute } from "@tanstack/react-router";
import { SocialHub } from "@/pages/SocialHub";

export const Route = createFileRoute("/social")({
  component: SocialHub,
});