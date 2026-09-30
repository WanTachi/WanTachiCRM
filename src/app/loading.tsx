export default function Loading() {
  return (
    <main className="page-container" aria-busy="true" aria-label="Загрузка страницы">
      <p className="eyebrow">Загрузка</p>
      <div className="welcome-panel"><p className="welcome-copy">Подготавливаем рабочее пространство…</p></div>
    </main>
  );
}
