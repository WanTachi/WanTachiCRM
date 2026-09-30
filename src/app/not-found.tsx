import Link from "next/link";

export default function NotFound() {
  return (
    <main className="state-page">
      <section className="state-card">
        <p className="eyebrow">404 · Страница не найдена</p>
        <h1>Такой страницы нет</h1>
        <p>Возможно, адрес изменился или в нём допущена ошибка.</p>
        <Link className="button button--primary button--md" href="/">Вернуться на главную</Link>
      </section>
    </main>
  );
}
