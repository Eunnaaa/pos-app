import "server-only";

export type SuperAdminIdentity = {
  email?: string | null;
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
};

/**
 * Checks whether a given user email is the authorized platform Super Admin.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Platform access requires control of a server-side allowlisted email, a
 * verified mailbox, and an enrolled second factor. Client-side checks must
 * never be used as an authorization decision.
 */
export function isSuperAdminUser(identity?: SuperAdminIdentity | null): boolean {
  return Boolean(
    identity &&
    identity.emailVerified === true &&
    identity.twoFactorEnabled === true &&
    isSuperAdminEmail(identity.email),
  );
}

export function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((email, index, emails) => Boolean(email) && emails.indexOf(email) === index);
}
