"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RewardForm = {
  full_name: string;
  bank_name: string;
  payout_phone: string;
  consent_personal_data: boolean;
};

const STORAGE_KEY = "forecast_reward_form_v1";
const ONBOARDING_STORAGE_KEY = "forecast_onboarding_v1";
const API_BASE = "http://127.0.0.1:8000";
const ORGANIZER_EMAIL = "research@example.com";

const INITIAL_FORM: RewardForm = {
  full_name: "",
  bank_name: "",
  payout_phone: "",
  consent_personal_data: false,
};

export default function RewardPage() {
  const router = useRouter();

  const [form, setForm] = useState<RewardForm>(INITIAL_FORM);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

    if (!userId) {
      router.push("/");
      return;
    }

    const rewardRaw =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;

    const onboardingRaw =
      typeof window !== "undefined"
        ? localStorage.getItem(ONBOARDING_STORAGE_KEY)
        : null;

    let fullName = "";

    if (onboardingRaw) {
      try {
        const onboarding = JSON.parse(onboardingRaw);
        fullName = onboarding?.form?.full_name ?? "";
      } catch {}
    }

    if (rewardRaw) {
      try {
        const savedForm = JSON.parse(rewardRaw) as Partial<RewardForm>;
        setForm({
          ...INITIAL_FORM,
          ...savedForm,
          full_name: fullName || savedForm.full_name || "",
          bank_name: savedForm.bank_name || "",
          payout_phone: savedForm.payout_phone || "",
          consent_personal_data: Boolean(savedForm.consent_personal_data),
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setForm({
          ...INITIAL_FORM,
          full_name: fullName || "",
        });
      }
    } else {
      setForm({
        ...INITIAL_FORM,
        full_name: fullName || "",
      });
    }

    setHydrated(true);
  }, [router]);

  useEffect(() => {
    if (!hydrated || saved) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [hydrated, form, saved]);

  function updateField<K extends keyof RewardForm>(
    key: K,
    value: RewardForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = useMemo(() => {
    return (
      (form.full_name ?? "").trim().length >= 3 &&
      (form.bank_name ?? "").trim().length >= 2 &&
      (form.payout_phone ?? "").trim().length >= 6 &&
      !!form.consent_personal_data
    );
  }, [form]);

  async function handleSubmit() {
    try {
      setLoading(true);
      setError("");
      setSaved(false);

      const userId =
        typeof window !== "undefined"
          ? localStorage.getItem("user_id")
          : null;

      const response = await fetch(`${API_BASE}/reward/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId ? Number(userId) : null,
          amount_rub: 300,
          ...form,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || "Не удалось сохранить данные");
      }

      localStorage.removeItem(STORAGE_KEY);
      setForm(INITIAL_FORM);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Ошибка при сохранении данных");
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="gradient-mesh min-h-screen min-h-[100dvh] p-4">
        <div className="max-w-2xl mx-auto glass rounded-3xl p-6">
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] px-4 py-6">
      <div className="max-w-2xl mx-auto glass rounded-3xl p-6 md:p-8">
        <div className="mb-6 text-center">
          <p className="text-xs text-muted-foreground mb-2">
            Выплата вознаграждения
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold mb-3">
            Данные для получения вознаграждения
          </h1>
          <p className="text-sm md:text-base text-foreground/80 leading-7">
            Спасибо за участие. Размер вознаграждения составляет{" "}
            <span className="font-semibold">300 рублей</span>.
          </p>
        </div>

        {!saved ? (
          <>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-4 mb-5">
              <p className="text-sm leading-6 text-foreground/85">
                Перевод вознаграждения осуществляется{" "}
                <span className="font-semibold">только по номеру телефона</span>.
                Пожалуйста, внимательно проверьте введённые данные.
              </p>
              <p className="text-sm leading-6 text-foreground/85 mt-3">
                При возникновении вопросов или проблем свяжитесь с организаторами по
                почте <span className="font-semibold">{ORGANIZER_EMAIL}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm mb-2">ФИО</p>
                <input
                  className="w-full rounded-2xl bg-muted/10 border border-white/10 px-4 py-3"
                  placeholder="Введите ФИО"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                />
              </div>

              <div>
                <p className="text-sm mb-2">Банк</p>
                <input
                  className="w-full rounded-2xl bg-muted/10 border border-white/10 px-4 py-3"
                  placeholder="Например, Сбербанк"
                  value={form.bank_name}
                  onChange={(e) => updateField("bank_name", e.target.value)}
                />
              </div>

              <div>
                <p className="text-sm mb-2">Номер телефона для перевода</p>
                <input
                  className="w-full rounded-2xl bg-muted/10 border border-white/10 px-4 py-3"
                  placeholder="+7 ..."
                  value={form.payout_phone}
                  onChange={(e) => updateField("payout_phone", e.target.value)}
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-muted/10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.consent_personal_data}
                  onChange={(e) =>
                    updateField("consent_personal_data", e.target.checked)
                  }
                  className="mt-1"
                />
                <span className="text-sm leading-6 text-foreground/85">
                  Я согласен(а) на обработку персональных данных, указанных в этой
                  форме, исключительно для выплаты вознаграждения.
                </span>
              </label>
            </div>

            {error ? (
              <div className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-2xl px-4 py-3">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => router.push("/leaderboard")}
                className="flex-1 rounded-2xl px-5 py-3 bg-muted/10 border border-white/10"
              >
                К рейтингу
              </button>

              <button
                type="button"
                disabled={!canSubmit || loading}
                onClick={handleSubmit}
                className={
                  "flex-1 rounded-2xl px-5 py-3 border " +
                  (canSubmit && !loading
                    ? "bg-blue-500/25 border-blue-400/60"
                    : "bg-muted/10 border-white/10 opacity-50 cursor-not-allowed")
                }
              >
                {loading ? "Сохраняем..." : "Сохранить данные"}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="rounded-2xl border border-green-400/20 bg-green-500/10 px-4 py-6">
              <p className="text-lg font-semibold text-green-200 mb-2">
                Данные сохранены
              </p>
              <p className="text-sm text-foreground/80">
                Спасибо за участие в эксперименте!
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => router.push("/leaderboard")}
                className="w-full rounded-2xl px-5 py-3 border bg-blue-500/25 border-blue-400/60"
              >
                Рейтинг других участников
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}