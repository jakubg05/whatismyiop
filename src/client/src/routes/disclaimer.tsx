import { createFileRoute } from "@tanstack/react-router";
import { MedicalDisclaimerPage } from "../features/legal";

export const Route = createFileRoute("/disclaimer")({
  component: MedicalDisclaimerPage,
});
