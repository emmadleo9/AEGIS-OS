import { createFileRoute } from "@tanstack/react-router";
import { DevicesView } from "@/features/devices/DevicesView";

export const Route = createFileRoute("/devices")({
  component: Devices,
});