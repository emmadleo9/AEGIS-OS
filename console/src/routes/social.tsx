import { createFileRoute } from "@tanstack/react-router";
import { SocialHub } from "@/features/social/SocialHub";

export const Route = createFileRoute("/social")({
  component: SocialHub,
});