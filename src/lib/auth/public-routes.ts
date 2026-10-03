const publicAuthPaths = new Set([
  "/login",
  "/register",
  "/auth/confirm",
  "/auth/recovery",
  "/forgot-password",
  "/reset-password",
]);

export function isPublicAuthPath(pathname: string): boolean {
  return publicAuthPaths.has(pathname);
}
