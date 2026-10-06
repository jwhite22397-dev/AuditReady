import type { Plan } from "./types";

export interface Entitlements {
  plan: Plan | "demo";
  vendors: number;
  users: number;
  activeAssessments: number;
  customQuestionnaires: boolean;
  label: string;
  priceLabel: string;
}

const LIMITED: Record<Plan, Entitlements> = {
  starter: {
    plan: "starter",
    vendors: 15,
    users: 3,
    activeAssessments: 20,
    customQuestionnaires: false,
    label: "Starter",
    priceLabel: "$49/month",
  },
  pro: {
    plan: "pro",
    vendors: 75,
    users: 10,
    activeAssessments: 100,
    customQuestionnaires: true,
    label: "Pro",
    priceLabel: "$149/month",
  },
  business: {
    plan: "business",
    vendors: 250,
    users: 30,
    activeAssessments: 500,
    customQuestionnaires: true,
    label: "Business",
    priceLabel: "$299/month",
  },
};

const DEMO: Entitlements = {
  plan: "demo",
  vendors: 10_000,
  users: 10_000,
  activeAssessments: 10_000,
  customQuestionnaires: true,
  label: "Demo",
  priceLabel: "Included",
};

export function entitlementsFor(plan: Plan, mode: "demo" | "supabase"): Entitlements {
  if (mode === "demo") return DEMO;
  return LIMITED[plan];
}

export function planCatalog(): Entitlements[] {
  return [LIMITED.starter, LIMITED.pro, LIMITED.business];
}

export function withinLimit(used: number, limit: number): boolean {
  return used < limit;
}
