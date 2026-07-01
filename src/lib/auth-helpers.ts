// Convert username <-> synthetic email so users can log in with simple usernames.
const DOMAIN = "trabajos.local";

export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!u) throw new Error("Usuario inválido");
  if (u.includes("@")) return u; // already email
  return `${u}@${DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  return email.split("@")[0];
}
