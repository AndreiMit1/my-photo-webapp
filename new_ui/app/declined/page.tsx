"use client";

import { useRouter } from "next/navigation";

export default function DeclinedPage() {
  const router = useRouter();

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] px-4 py-6">
      <div className="max-w-xl mx-auto glass rounded-3xl p-6 md:p-8 text-center">
        <p className="text-xs font-mono text-muted-foreground mb-2">
          Эксперимент
        </p>

        <h1 className="text-2xl font-semibold mb-4">
          Участие не подтверждено
        </h1>

        <p className="text-sm text-foreground/80 leading-7">
          Без согласия на участие мы не можем продолжить эксперимент.
        </p>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 rounded-2xl px-5 py-3 bg-blue-500/25 border border-blue-400/60 font-mono"
        >
          Вернуться назад
        </button>
      </div>
    </div>
  );
}