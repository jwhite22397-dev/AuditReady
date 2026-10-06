export function createId(): string {
  return crypto.randomUUID();
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function generateToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
  return sha256(`auditready.token.v1:${token}`);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(`auditready.demo-password.v1:${salt}:${password}`);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

export function todayUTC(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toDate.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

const FREQUENCY_MONTHS = {
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  biennial: 24,
} as const;

export function nextReviewDate(fromIso: string, frequency: keyof typeof FREQUENCY_MONTHS): string {
  return addMonths(fromIso, FREQUENCY_MONTHS[frequency]).slice(0, 10);
}
