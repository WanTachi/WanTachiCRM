export function isSafeReturnPath(value: FormDataEntryValue | null): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return false;
  }

  const target = new URL(value, "https://wan-tachi.invalid");
  if (target.origin !== "https://wan-tachi.invalid") return false;
  return !["/login", "/register", "/auth"].some(
    (path) => target.pathname === path || target.pathname.startsWith(`${path}/`),
  );
}
