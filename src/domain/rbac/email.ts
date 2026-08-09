/**
 * @feature rbac
 * @layer domain
 *
 * Canonical form for invite matching and unique storage.
 *
 * Neon Auth emails and admin invites must collide on the same address even when
 * the IdP or operator types different case or surrounding whitespace.
 */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("normalizeEmail: email is blank after trim");
  }
  return normalized;
}
