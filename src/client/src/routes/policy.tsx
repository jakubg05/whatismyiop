import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "../features/legal";

export const Route = createFileRoute("/policy")({
  component: PrivacyPolicyPage,
});
