import type {
  CrmActionError,
  CrmActivityInput,
  CrmActivityType,
  CrmAccountInput,
  CrmContactInput,
  CrmDealInput,
  CrmPipelineInput,
  CrmPipelineStage,
  CrmPipelineStageInput,
  CrmTaskInput,
  CrmTaskPriority,
  CrmTaskStatus,
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

function optionalUuid(
  formData: FormData,
  field: string,
  label: string,
): CrmResult<string | null | undefined> {
  const value = formData.get(field);
  if (value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return invalid(`Выберите допустимый ${label}.`);
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!isCrmRecordId(trimmed)) return invalid(`Выберите допустимый ${label}.`);
  return { ok: true, value: trimmed };
}

export function validatePipelineForm(formData: FormData): CrmResult<CrmPipelineInput> {
  const name = getText(formData, "name");
  const description = getText(formData, "description");
  if (name === null || name.length < 1 || name.length > 160) {
    return invalid("Укажите название воронки длиной от 1 до 160 символов.");
  }
  if (description === null || description.length > 2000) {
    return invalid("Описание воронки должно содержать не более 2000 символов.");
  }

  const ownerUserId = optionalUuid(formData, "owner_user_id", "владельца");
  if (!ownerUserId.ok) return ownerUserId;

  return {
    ok: true,
    value: {
      name,
      description: description || null,
      owner_user_id: ownerUserId.value,
    },
  };
}

export function validatePipelineStageForm(formData: FormData): CrmResult<CrmPipelineStageInput> {
  const pipelineId = getText(formData, "pipeline_id");
  const name = getText(formData, "name");
  const rawPosition = getText(formData, "position");
  const rawProbability = getText(formData, "probability");

  if (pipelineId === null || !isCrmRecordId(pipelineId)) {
    return invalid("Выберите допустимую воронку.");
  }
  if (name === null || name.length < 1 || name.length > 120) {
    return invalid("Укажите название этапа длиной от 1 до 120 символов.");
  }
  if (rawPosition === null || !/^(0|[1-9]\d*)$/.test(rawPosition)) {
    return invalid("Позиция этапа должна быть целым числом не меньше 0.");
  }
  const position = Number(rawPosition);
  if (!Number.isSafeInteger(position) || position > 2147483647) {
    return invalid("Укажите допустимую позицию этапа.");
  }

  let probability: number | null = null;
  if (rawProbability === null) return invalid("Укажите корректную вероятность этапа.");
  if (rawProbability !== "") {
    if (!/^\d+(?:\.\d+)?$/.test(rawProbability)) {
      return invalid("Вероятность должна быть числом от 0 до 100.");
    }
    probability = Number(rawProbability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      return invalid("Вероятность должна быть числом от 0 до 100.");
    }
  }

  return { ok: true, value: { pipeline_id: pipelineId, name, position, probability } };
}

export function validateDealForm(formData: FormData): CrmResult<CrmDealInput> {
  const pipelineId = getText(formData, "pipeline_id");
  const stageId = getText(formData, "stage_id");
  const name = getText(formData, "name");
  const description = getText(formData, "description");
  const rawAmount = getText(formData, "amount");
  const rawCurrency = getText(formData, "currency");
  const rawCloseDate = getText(formData, "expected_close_date");

  if (pipelineId === null || !isCrmRecordId(pipelineId)) return invalid("Выберите допустимую воронку.");
  if (stageId === null || !isCrmRecordId(stageId)) return invalid("Выберите допустимый этап.");
  if (name === null || name.length < 1 || name.length > 200) {
    return invalid("Укажите название сделки длиной от 1 до 200 символов.");
  }
  if (description === null || description.length > 5000) {
    return invalid("Описание сделки должно содержать не более 5000 символов.");
  }
  if (rawAmount === null) return invalid("Укажите корректную сумму сделки.");
  if (rawAmount !== "" && (!/^\d+(?:\.\d+)?$/.test(rawAmount) || !Number.isFinite(Number(rawAmount)))) {
    return invalid("Сумма должна быть неотрицательным числом.");
  }
  if (rawCurrency === null) return invalid("Укажите корректную валюту.");
  let currency: string | null = null;
  if (rawCurrency !== "") {
    if (!/^[a-z]{3}$/i.test(rawCurrency)) return invalid("Валюта должна быть указана трёхбуквенным кодом, например USD или AED.");
    currency = rawCurrency.toUpperCase();
  }
  if (rawCloseDate === null) return invalid("Укажите корректную ожидаемую дату закрытия.");
  let expectedCloseDate: string | null = null;
  if (rawCloseDate !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawCloseDate)) return invalid("Укажите корректную ожидаемую дату закрытия.");
    const date = new Date(`${rawCloseDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawCloseDate) {
      return invalid("Укажите корректную ожидаемую дату закрытия.");
    }
    expectedCloseDate = rawCloseDate;
  }

  const accountId = optionalUuid(formData, "account_id", "аккаунт");
  if (!accountId.ok) return accountId;
  const contactId = optionalUuid(formData, "contact_id", "контакт");
  if (!contactId.ok) return contactId;
  const ownerUserId = optionalUuid(formData, "owner_user_id", "владельца");
  if (!ownerUserId.ok) return ownerUserId;

  return {
    ok: true,
    value: {
      pipeline_id: pipelineId,
      stage_id: stageId,
      account_id: accountId.value,
      contact_id: contactId.value,
      name,
      description: description || null,
      amount: rawAmount || null,
      currency,
      owner_user_id: ownerUserId.value,
      expected_close_date: expectedCloseDate,
    },
  };
}

const TASK_STATUSES: CrmTaskStatus[] = ["open", "in_progress", "completed", "cancelled"];
const TASK_PRIORITIES: CrmTaskPriority[] = ["low", "normal", "high", "urgent"];
const ACTIVITY_TYPES: CrmActivityType[] = ["note", "call", "meeting", "email", "other"];

function dateAtUtcEndOfDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return `${value}T23:59:59.999Z`;
}

function dateAtUtcMidday(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return `${value}T12:00:00.000Z`;
}

export function validateTaskForm(formData: FormData): CrmResult<CrmTaskInput> {
  const title = getText(formData, "title");
  const description = getText(formData, "description");
  const status = getText(formData, "status");
  const priority = getText(formData, "priority");
  const dueDate = getText(formData, "due_date");

  if (title === null || title.length < 1 || title.length > 200) {
    return invalid("Укажите название задачи длиной от 1 до 200 символов.");
  }
  if (description === null || description.length > 5000) {
    return invalid("Описание задачи должно содержать не более 5000 символов.");
  }
  if (status === null || !TASK_STATUSES.includes(status as CrmTaskStatus)) {
    return invalid("Выберите допустимый статус задачи.");
  }
  if (priority === null || !TASK_PRIORITIES.includes(priority as CrmTaskPriority)) {
    return invalid("Выберите допустимый приоритет задачи.");
  }
  if (dueDate === null) return invalid("Укажите допустимый срок задачи.");
  const dueAt = dueDate ? dateAtUtcEndOfDay(dueDate) : null;
  if (dueDate && !dueAt) return invalid("Укажите корректную дату срока.");

  const ownerUserId = optionalUuid(formData, "owner_user_id", "ответственного");
  if (!ownerUserId.ok) return ownerUserId;
  const accountId = optionalUuid(formData, "account_id", "аккаунт");
  if (!accountId.ok) return accountId;
  const contactId = optionalUuid(formData, "contact_id", "контакт");
  if (!contactId.ok) return contactId;
  const dealId = optionalUuid(formData, "deal_id", "сделку");
  if (!dealId.ok) return dealId;

  return {
    ok: true,
    value: {
      title,
      description: description || null,
      status: status as CrmTaskStatus,
      priority: priority as CrmTaskPriority,
      due_at: dueAt,
      owner_user_id: ownerUserId.value,
      account_id: accountId.value,
      contact_id: contactId.value,
      deal_id: dealId.value,
    },
  };
}

export function validateActivityForm(formData: FormData): CrmResult<CrmActivityInput> {
  const type = getText(formData, "type");
  const subject = getText(formData, "subject");
  const body = getText(formData, "body");
  const occurredDate = getText(formData, "occurred_date");

  if (type === null || !ACTIVITY_TYPES.includes(type as CrmActivityType)) {
    return invalid("Выберите допустимый тип активности.");
  }
  if (subject === null || subject.length > 200) {
    return invalid("Тема активности должна содержать не более 200 символов.");
  }
  if (body === null || body.length > 12000) {
    return invalid("Описание активности должно содержать не более 12000 символов.");
  }
  if (occurredDate === null) return invalid("Укажите допустимую дату активности.");
  const occurredAt = occurredDate ? dateAtUtcMidday(occurredDate) : null;
  if (occurredDate && !occurredAt) return invalid("Укажите корректную дату активности.");

  const accountId = optionalUuid(formData, "account_id", "аккаунт");
  if (!accountId.ok) return accountId;
  const contactId = optionalUuid(formData, "contact_id", "контакт");
  if (!contactId.ok) return contactId;
  const dealId = optionalUuid(formData, "deal_id", "сделку");
  if (!dealId.ok) return dealId;
  const taskId = optionalUuid(formData, "task_id", "задачу");
  if (!taskId.ok) return taskId;

  return {
    ok: true,
    value: {
      type: type as CrmActivityType,
      subject: subject || null,
      body: body || null,
      occurred_at: occurredAt,
      account_id: accountId.value,
      contact_id: contactId.value,
      deal_id: dealId.value,
      task_id: taskId.value,
    },
  };
}

export function isStageInPipeline(
  stages: Pick<CrmPipelineStage, "id" | "pipeline_id">[],
  pipelineId: string,
  stageId: string,
): boolean {
  return stages.some((stage) => stage.id === stageId && stage.pipeline_id === pipelineId);
}

export function invalidRecordIdError(
  noun: "аккаунт" | "контакт" | "воронку" | "этап" | "сделку" | "задачу" | "активность",
): CrmActionError {
  return { code: "invalid_input", message: `Укажите корректный идентификатор: ${noun}.` };
}
