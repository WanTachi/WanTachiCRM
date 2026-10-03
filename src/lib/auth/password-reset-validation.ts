const minimumPasswordLength = 10;

export function validatePasswordResetEmail(value: FormDataEntryValue | null):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return { ok: false, error: "Введите корректный email." };
  }

  return { ok: true, email };
}

export function validateNewPassword(passwordValue: FormDataEntryValue | null, confirmationValue: FormDataEntryValue | null):
  | { ok: true; password: string }
  | { ok: false; error: string } {
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmation = typeof confirmationValue === "string" ? confirmationValue : "";

  if (password.length < minimumPasswordLength) {
    return { ok: false, error: `Пароль должен содержать не менее ${minimumPasswordLength} символов.` };
  }
  if (password !== confirmation) {
    return { ok: false, error: "Пароли не совпадают." };
  }

  return { ok: true, password };
}

export function getPasswordRecoveryRedirectUrl(siteUrl: string): string {
  return new URL("/auth/recovery", siteUrl).toString();
}

export function getEmailConfirmationRedirectUrl(siteUrl: string): string {
  return new URL("/auth/confirm", siteUrl).toString();
}
