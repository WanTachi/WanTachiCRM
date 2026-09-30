# WanTachi CRM

Универсальная CRM/SaaS-платформа. Текущий этап: **Phase 1 — authentication, organizations, multi-tenant foundation**. CRM-модули ещё не создавались.

## Стек

- Next.js App Router 16, React 19, TypeScript, Tailwind CSS 4
- Supabase Auth и PostgreSQL через `@supabase/ssr` / `@supabase/supabase-js`
- PostgreSQL RLS, versioned SQL migrations и pgTAP для tenant security tests
- ESLint 9 и Vitest 5

Нужны Node.js 20.9+ и npm. Для локальной базы — [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) и Docker-compatible runtime.

## Настройка Supabase

1. Создайте Supabase project либо подготовьте Docker и Supabase CLI для локальной разработки.
2. Скопируйте `.env.example` в `.env.local` и укажите URL проекта, его publishable key и URL приложения. Для локального проекта значения URL и key выводит `supabase status` после `supabase start`.
3. В Supabase Auth URL Configuration установите Site URL в `NEXT_PUBLIC_SITE_URL` и разрешите redirect URL `${NEXT_PUBLIC_SITE_URL}/auth/confirm`.
4. Для SSR-подтверждения email откройте Auth Email Templates → Confirm signup и задайте ссылку на серверный callback: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Без этого изменения шаблона Supabase по умолчанию отправляет email по redirect flow, который не передаёт token hash этому callback.
5. Примените versioned миграции командой `npm run db:reset` для локальной базы или выполните `supabase db push --linked` для связанного проекта после его настройки.

Publishable key предназначен для клиентского приложения и не является service-role ключом. Service-role key в этом проекте не используется. Не добавляйте реальные значения `.env.local` в Git.

### Environment variables

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Публичный publishable key проекта; никогда не service-role key |
| `NEXT_PUBLIC_SITE_URL` | Базовый URL сайта для подтверждения email |
| `NEXT_PUBLIC_BRAND_NAME` | Имя бренда, по умолчанию `WanTachi` |
| `NEXT_PUBLIC_BRAND_LOGO` | Путь к логотипу в `public/`, необязательно |
| `NEXT_PUBLIC_BRAND_FAVICON` | Путь к favicon в `public/`, необязательно |

Без трёх Supabase-переменных вход и защищённые страницы показывают состояние настройки. Это позволяет проверять сборку без выдуманных credentials.

## Запуск

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Локальную Supabase базу запустите отдельно командами `npm run db:start` и `npm run db:reset`.

## Проверки

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest запускает тесты TypeScript-кода. Tenant policies проверяются отдельно настоящими PostgreSQL/pgTAP тестами:

```bash
npm run db:start
npm run test:db
```

`supabase test db` требует работающую локальную Supabase базу. Без установленного Docker/Supabase CLI эти RLS integration tests нельзя выполнить; не заменяйте их unit-тестом SQL-файла.

## Реализованный поток

- Регистрация, подтверждение email и вход идут через Supabase Auth; пароли приложение не хранит.
- Next.js 16 `proxy.ts` обновляет HttpOnly cookie-сессию через `auth.getClaims()` и перенаправляет неавторизованные запросы на вход. Защищённый route group повторно проверяет пользователя серверным `auth.getUser()`.
- После регистрации пользователь без членств попадает на создание организации. RPC `create_organization` атомарно создаёт организацию, роли Owner/Admin/Member, связи permission и активное членство владельца.
- Активная организация хранится в HttpOnly cookie, но принимается только после повторной загрузки membership для текущего Supabase user. Переключение проверяет членство на сервере; значение cookie само по себе не даёт доступа.
- Отдельная profile/users таблица не нужна на этом этапе: Supabase Auth — источник идентичности, а `memberships.user_id` ссылается на `auth.users`.

## Database и безопасность

Миграция `supabase/migrations/20260930160000_auth_organizations_tenancy.sql` создаёт только `organizations`, `memberships`, `roles`, `permissions`, `role_permissions` и связанные функции/индексы. В неё включены RLS policies и ограничения для запрета межорганизационной роли и повторного membership. Создание организации доступно только атомарной RPC. Для организации нет политики удаления, поэтому RLS применяет default-deny; прямое создание организаций и прямые записи в memberships закрыты привилегиями таблиц.

Для RLS нужна `private.has_organization_permission`: она проверяет роль без рекурсивного запуска политик и возвращает только boolean. Схема `private` не включена в список API-схем Supabase, поэтому функция недоступна как PostgREST RPC.

`supabase/tests/organizations_rls.test.sql` — pgTAP integration suite: проверяет таблицы, чтение/обновление/удаление tenant A/B, видимость ролей и membership, права, FK/unique ограничения и создание организации RPC. Файл создан, но здесь не выполнен: в среде отсутствуют Docker, Supabase CLI и PostgreSQL. Перед использованием миграции запустите её на локальном Supabase и выполните `npm run test:db`.

## Структура

```text
src/app/actions/              # серверные auth и organization actions
src/app/(authenticated)/      # серверно-защищённые страницы
src/app/login, register/      # auth UI
src/lib/auth/                 # проверка пользователя и membership
src/lib/supabase/             # SSR client и env config
supabase/migrations/          # versioned PostgreSQL schema/RLS
supabase/tests/               # pgTAP tenant-isolation integration tests
tests/                        # Vitest unit tests
```
