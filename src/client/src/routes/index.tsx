import { createFileRoute } from "@tanstack/react-router";
import { AnalysisWorkspacePage } from "../features/workspace";

export const Route = createFileRoute("/")({
  component: AnalysisWorkspacePage,
});
