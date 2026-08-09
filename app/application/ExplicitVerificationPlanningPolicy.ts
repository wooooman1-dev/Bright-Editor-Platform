export const explicitVerificationPlanningEnvironmentVariable = "BRIGHT_EXPLICIT_VERIFICATION_PLANNING";
export { planningVerificationClaimMaximum, type PlanningVerificationClaimDraft } from "./PlanningContracts";
export function isExplicitVerificationPlanningEnabled(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return environment[explicitVerificationPlanningEnvironmentVariable] === "1";
}
