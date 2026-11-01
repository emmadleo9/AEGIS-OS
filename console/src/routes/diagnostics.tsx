import { createFileRoute } from "@tanstack/react-router";
import { DiagnosticsView } from "@/features/diagnostics/DiagnosticsView";

export const Route = createFileRoute("/diagnostics")({
  component: Diagnostics,
});