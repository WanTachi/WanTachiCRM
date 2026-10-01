import type {
  CrmActionError,
  CrmAccountInput,
  CrmContactInput,
  CrmResult,
} from "@/lib/crm/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getText(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (value === null) return "";
  return typeof value === "string" ? value.trim() : null;
}

function invalid(message: string): CrmResult<never> {
  return { ok: false, error: { code: "invalid_input", message } };
}

export function isCrmRecordId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateAccountForm(formData: FormData): CrmResult<CrmAccountInput> {
  const name = getText(formData, "name");
  if (name === null || name.length < 1 || name.length > 160) {
    return invalid("Укажите название аккаунта длиной от 1 до 160 символов.");
  }

  const website = getText(formData, "website");
  const phone = getText(formData, "phone");
  const industry = getText(formData, "industry");
  if (website === null || website.length > 2048) return invalid("Адрес сайта слишком длинный.");
  if (phone === null || phone.length > 64) return invalid("Телефон должен содержать не более 64 символов.");
  if (industry === null || industry.length > 120) return invalid("Отрасль должна содержать не более 120 символов.");

  return {
    ok: true,
    value: {
      name,
      website: website || null,
      phone: phone || null,
      industry: industry || null,
    },
  };
}

export function validateContactForm(formData: FormData): CrmResult<CrmContactInput> {
  const firstName = getText(formData, "first_name");
  const lastName = getText(formData, "last_name");
  const email = getText(formData, "email");
  const phone = getText(formData, "phone");
  const jobTitle = getText(formData, "job_title");
  const rawAccountId = formData.get("account_id");

  if (firstName === null || firstName.length < 1 || firstName.length > 100) {
    return invalid("Укажите имя контакта длиной от 1 до 100 символов.");
  }
  if (lastName === null || lastName.length > 100) return invalid("Фамилия должна содержать не более 100 символов.");
  if (email === null || email.length > 320 || (email !== "" && !EMAIL_PATTERN.test(email))) {
    return invalid("Проверьте адрес email контакта.");
  }
  if (phone === null || phone.length > 64) return invalid("Телефон должен содержать не более 64 символов.");
  if (jobTitle === null || jobTitle.length > 160) return invalid("Должность должна содержать не более 160 символов.");

  let accountId: string | null | undefined;
  if (rawAccountId === null) {
    accountId = undefined;
  } else if (typeof rawAccountId !== "string") {
    return invalid("Выберите допустимый аккаунт.");
  } else if (rawAccountId.trim() === "") {
    accountId = null;
  } else if (!isCrmRecordId(rawAccountId.trim())) {
    return invalid("Выберите допустимый аккаунт.");
  } else {
    accountId = rawAccountId.trim();
  }

  return {
    ok: true,
    value: {
      first_name: firstName,
      last_name: lastName || null,
      email: email || null,
      phone: phone || null,
      job_title: jobTitle || null,
      account_id: accountId,
    },
  };
}

export function invalidRecordIdError(noun: "аккаунт" | "контакт"): CrmActionError {
  return { code: "invalid_input", message: `Укажите корректный идентификатор: ${noun}.` };
}
