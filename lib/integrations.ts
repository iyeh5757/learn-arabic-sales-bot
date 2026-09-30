export type ProviderId = "evolution" | "meta" | "google" | "payments";

export type IntegrationSpec = {
  id: ProviderId;
  name: string;
  purpose: string;
  env: string[];
};

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    id: "evolution",
    name: "Evolution API",
    purpose: "WhatsApp messaging through Evolution.",
    env: ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"],
  },
  {
    id: "meta",
    name: "Meta WhatsApp Cloud",
    purpose: "WhatsApp Business Cloud API.",
    env: ["META_WHATSAPP_TOKEN", "META_PHONE_NUMBER_ID"],
  },
  {
    id: "google",
    name: "Google",
    purpose: "Calendar booking and lead ads.",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    id: "payments",
    name: "Payments",
    purpose: "Checkout and refunds.",
    env: ["PAYMENTS_PROVIDER", "PAYMENTS_SECRET_KEY"],
  },
];

export function isProvider(value: string): value is ProviderId {
  return INTEGRATIONS.some((item) => item.id === value);
}

export function integrationStatus() {
  return INTEGRATIONS.map((item) => ({
    ...item,
    stub: true,
    credentialPresent: item.env.some((key) => Boolean(process.env[key])),
    message: `${item.name} stub. No external request is made.`,
  }));
}

export function stubResult(provider: ProviderId, body: unknown) {
  const spec = INTEGRATIONS.find((item) => item.id === provider)!;
  const preview =
    body && typeof body === "object"
      ? JSON.parse(JSON.stringify(body, (_key, value) =>
          typeof value === "string" && value.length > 180 ? `${value.slice(0, 180)}…` : value,
        ))
      : body ?? null;

  return {
    ok: false as const,
    stub: true as const,
    provider,
    message: `${spec.name} stub. Nothing was sent and no external request was made.`,
    credentialPresent: spec.env.some((key) => Boolean(process.env[key])),
    acceptedForLater: preview,
  };
}
