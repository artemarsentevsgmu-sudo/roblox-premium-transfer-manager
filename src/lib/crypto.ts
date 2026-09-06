import crypto from "crypto";

/**
 * Cookie encryption (AES-256-GCM).
 * Key source: COOKIE_SECRET env var, otherwise derived from DATABASE_URL so
 * the app works out of the box. Set COOKIE_SECRET in production.
 */
function getKey(): Buffer {
  const secret =
    process.env.COOKIE_SECRET ||
    `robuxflow:${process.env.DATABASE_URL ?? "dev-secret"}`;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCookie(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptCookie(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed cipher payload");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Normalize whatever the user pasted into a bare .ROBLOSECURITY value. */
export function normalizeCookieInput(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Someone may paste a full Cookie header or ".ROBLOSECURITY=value; other=..."
  const match = s.match(/\.ROBLOSECURITY=([^;\s]+)/i);
  if (match) s = match[1];
  // Strip wrapping quotes if any
  s = s.replace(/^"|"$/g, "").trim();
  if (!s) return null;
  // Real cookies start with _|WARNING:... but be lenient
  if (s.length < 30) return null;
  if (/\s/.test(s)) return null;
  return s;
}
