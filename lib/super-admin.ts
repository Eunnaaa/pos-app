export const DEFAULT_SUPER_ADMIN_EMAIL = "garryhardyansyah22@gmail.com";

/**
 * Checks whether a given user email is the authorized platform Super Admin.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const configured =
    (typeof process !== "undefined" && process.env?.SUPER_ADMIN_EMAILS) ||
    DEFAULT_SUPER_ADMIN_EMAIL;

  const allowed = configured
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return (
    allowed.includes(email.toLowerCase()) ||
    email.toLowerCase() === DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase()
  );
}

export function getSuperAdminEmails(): string[] {
  const configured =
    (typeof process !== "undefined" && (process.env?.SUPER_ADMIN_EMAILS || process.env?.NEXT_PUBLIC_SUPER_ADMIN_EMAILS)) ||
    DEFAULT_SUPER_ADMIN_EMAIL;

  const emails = configured
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.includes(DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase())) {
    emails.push(DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase());
  }

  return Array.from(new Set(emails));
}

