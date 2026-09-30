import { trialEligibility } from "@/lib/trial";

export function TrialBadge({ countryCode }: { countryCode: string }) {
  const decision = trialEligibility(countryCode);
  const tone = decision.region === "gulf" ? "gulf" : decision.eligible ? "ok" : "no";
  const label =
    decision.region === "gulf"
      ? "Trial eligible · Gulf"
      : decision.eligible
        ? "Trial eligible"
        : "Trial not available";
  return (
    <div>
      <span className={`badge ${tone}`}>{label}</span>
      <p className="reason">{decision.reason}</p>
    </div>
  );
}
