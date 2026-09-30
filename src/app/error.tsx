"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="state-page">
      <section className="state-card" role="alert">
        <p className="eyebrow">Не удалось загрузить страницу</p>
        <h1>Что-то пошло не так</h1>
        <p>Попробуйте загрузить эту страницу ещё раз. Если ошибка повторится, вернитесь позже.</p>
        <Button onClick={reset}>Повторить</Button>
      </section>
    </main>
  );
}
