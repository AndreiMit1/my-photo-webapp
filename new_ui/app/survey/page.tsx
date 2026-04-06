"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  full_name: string;
  org_raw: string;
  faculty_raw: string;
  degree: string;
  course: string;
  gpa_quantile: string;
  gpa_mathstat: string;
  gpa_econometrics: string;
  gpa_ml: string;
  wants_raffle: boolean;
  wants_leaderboard: boolean;
  email: string;
};

const API_BASE = "http://127.0.0.1:8000";
const OTP_BASE = "http://127.0.0.1:8001";
const STORAGE_KEY = "forecast_onboarding_v1";

const TOTAL_STEPS = 10;

const FACULTY_OPTIONS = [
  "Экономика и финансы",
  "Социальные науки",
  "Бизнес и менеджмент",
  "Международная экономика",
  "Мировая экономика и политика",
  "География и геоинформационные технологии",
  "Гуманитарные науки",
  "Математика",
  "Компьютерные науки",
  "Электроника и математические технологии",
  "Право",
  "Креативные индустрии",
  "Физика",
  "Городское и региональное развитие",
  "Химия",
  "Биология и биотехнологии",
  "Иностранные языки",
  "Юриспруденция и администрирование",
];

const UNIVERSITY_OPTIONS = [
  "МГУ",
  "СПбГУ",
  "ВШЭ",
  "МФТИ",
  "МГТУ",
  "РАНХиГС",
  "Финансовый университет",
  "РУДН",
  "ИТМО",
  "КФУ",
  "Другое",
];

const INITIAL_FORM: FormState = {
  full_name: "",
  org_raw: "",
  faculty_raw: "",
  degree: "",
  course: "",
  gpa_quantile: "",
  gpa_mathstat: "unknown",
  gpa_econometrics: "unknown",
  gpa_ml: "unknown",
  wants_raffle: false,
  wants_leaderboard: false,
  email: "",
};

type SavedDraft = {
  step: number;
  userId: number | null;
  participantId: string;
  code: string;
  form: FormState;
};

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const consent =
      typeof window !== "undefined"
        ? localStorage.getItem("experiment_consent")
        : null;

    if (consent !== "accepted") {
      router.push("/");
    }
  }, [router]);

  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<number | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [copiedParticipantId, setCopiedParticipantId] = useState(false);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setHydrated(true);
      return;
    }

    try {
      const saved = JSON.parse(raw) as Partial<SavedDraft>;
      if (saved.form) setForm({ ...INITIAL_FORM, ...saved.form });
      if (typeof saved.step === "number") setStep(saved.step);
      if (typeof saved.userId === "number") setUserId(saved.userId);
      if (typeof saved.participantId === "string") setParticipantId(saved.participantId);
      if (typeof saved.code === "string") setCode(saved.code);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const payload: SavedDraft = {
      step,
      userId,
      participantId,
      code,
      form,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, step, userId, participantId, code, form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function createProfile() {
    const r = await fetch(`${API_BASE}/profile/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Не удалось создать профиль");

    return {
      userId: data.user_id as number,
      participantId: (data.participant_id as string) || "",
    };
  }

  async function requestOtp(uid: number) {
    const r = await fetch(`${OTP_BASE}/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: uid,
        email: form.email,
      }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Не удалось отправить код");
    return data;
  }

  async function verifyOtp() {
    if (!userId) throw new Error("Нет user_id");

    const r = await fetch(`${OTP_BASE}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        email: form.email,
        code,
      }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Код неверный");
    return data;
  }

  async function attachEmail() {
    if (!userId) throw new Error("Нет user_id");

    const r = await fetch(`${API_BASE}/user/attach-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        email: form.email,
      }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Не удалось привязать email");
    return data;
  }

  async function nextStep() {
    if (!canGoNext) return;
    setError("");

    if (step === 6) {
      try {
        setLoading(true);

        let uid = userId;
        let pid = participantId;

        if (!uid) {
          const created = await createProfile();
          uid = created.userId;
          pid = created.participantId;

          setUserId(uid);
          setParticipantId(pid);
        }

        if (form.wants_raffle) {
          setStep(7);
        } else {
          setStep(8);
        }
      } catch (e: any) {
        setError(e.message || "Ошибка");
      } finally {
        setLoading(false);
      }
      return;
    }

    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }

  function prevStep() {
    setError("");

    if (step === 8 && !form.wants_raffle) {
      setStep(6);
      return;
    }

    setStep((s) => Math.max(0, s - 1));
  }

  async function handleCreateAndSendCode() {
    try {
      setLoading(true);
      setError("");

      let uid = userId;

      if (!uid) {
        const created = await createProfile();
        uid = created.userId;
        setUserId(created.userId);
        setParticipantId(created.participantId);
      }

      await requestOtp(uid);
      setStep(9);
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    try {
      setLoading(true);
      setError("");

      await verifyOtp();
      await attachEmail();

      localStorage.setItem("user_id", String(userId));
      if (participantId) {
        localStorage.setItem("participant_id", participantId);
      }

      localStorage.removeItem(STORAGE_KEY);
      router.push("/game");
    } catch (e: any) {
      setError(e.message || "Ошибка проверки кода");
    } finally {
      setLoading(false);
    }
  }

    async function handleCopyParticipantId() {
      if (!participantId) return;

      try {
        await navigator.clipboard.writeText(participantId);
        setError("");
        setCopiedParticipantId(true);
      } catch {
        setError("Не удалось скопировать ID");
      }
    }

  function renderChoice(
    keyValue: string,
    value: string,
    selected: boolean,
    onClick: () => void,
  ) {
    return (
      <button
        key={keyValue}
        type="button"
        onClick={onClick}
        className={
          "rounded-xl px-4 py-3 text-base text-center transition border " +
          (selected
            ? "bg-blue-500/25 border-blue-400/60"
            : "bg-muted/10 border-white/10 hover:bg-muted/20")
        }
      >
        {value}
      </button>
    );
  }

  const sectionTitle = useMemo(() => {
    switch (step) {
      case 0:
      case 1:
      case 2:
        return "О вас";
      case 3:
      case 4:
      case 5:
        return "Учёба";
      case 6:
        return "Участие";
      case 7:
      case 8:
      case 9:
        return "Доступ";
      default:
        return "";
    }
  }, [step]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 0:
        return form.full_name.trim().length >= 3;
      case 1:
        return form.org_raw.trim().length >= 2;
      case 2:
        return form.faculty_raw.trim().length >= 2;
      case 3:
        return !!form.degree;
      case 4:
        return !!form.course;
      case 5:
        return !!form.gpa_quantile;
      case 6:
        return true;
      case 7:
        return !!participantId;
      default:
        return false;
    }
  }, [step, form, participantId]);

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">Введите Ваше ФИО</h2>
            <input
              className="w-full rounded-xl bg-muted/10 border border-white/10 px-4 py-3 text-center"
              placeholder="Введите ФИО"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
            />
          </>
        );

      case 1:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">
              Где Вы учитесь или работаете?
            </h2>

            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl bg-muted/10 border border-white/10 px-4 pr-14 py-3 text-center"
                value={UNIVERSITY_OPTIONS.includes(form.org_raw) ? form.org_raw : "Другое"}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "Другое") {
                    updateField("org_raw", "");
                  } else {
                    updateField("org_raw", value);
                  }
                }}
              >
                <option value="">Выберите вариант</option>
                {UNIVERSITY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-white/80 text-xl">
                ▾
              </span>
            </div>

            {(form.org_raw === "" || !UNIVERSITY_OPTIONS.includes(form.org_raw)) && (
              <input
                className="w-full rounded-xl bg-muted/10 border border-white/10 px-4 py-3 text-center mt-3"
                placeholder="Введите свой вариант"
                value={form.org_raw}
                onChange={(e) => updateField("org_raw", e.target.value)}
              />
            )}
          </>
        );

      case 2:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">
              На каком направлении Вы обучаетесь? (Выберите из списка)
            </h2>

            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl bg-muted/10 border border-white/10 px-4 pr-14 py-3 text-center"
                value={form.faculty_raw}
                onChange={(e) => updateField("faculty_raw", e.target.value)}
              >
                <option value="">Выберите факультет</option>
                {FACULTY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-white/80 text-xl">
                ▾
              </span>
            </div>
          </>
        );

      case 3:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">Ваш текущий уровень образования?</h2>
            <div className="grid grid-cols-2 gap-2">
              {renderChoice("bachelor", "Бакалавр", form.degree === "bachelor", () =>
                updateField("degree", "bachelor"),
              )}
              {renderChoice("master", "Магистр", form.degree === "master", () =>
                updateField("degree", "master"),
              )}
              {renderChoice("phd", "Аспирант", form.degree === "phd", () =>
                updateField("degree", "phd"),
              )}
              {renderChoice("other-degree", "Другое", form.degree === "other", () =>
                updateField("degree", "other"),
              )}
            </div>
          </>
        );

      case 4:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">	На каком курсе Вы обучаетесь?</h2>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "graduate", "other"].map((v) =>
                renderChoice(
                  v,
                  v === "graduate" ? "Выпускник" : v === "other" ? "Другое" : v,
                  form.course === v,
                  () => updateField("course", v),
                ),
              )}
            </div>
          </>
        );

      case 5:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">
              Насколько хорошо Вы учитесь относительно остальных на Вашем потоке?
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {[
                ["top5", "Я примерно в числе лучших 5%"],
                ["top10", "Я примерно в числе лучших 10%"],
                ["top25", "Я примерно в числе лучших 25%"],
                ["50p", "Я примерно в средней половине или ниже"],
                ["unknown", "Мне сложно оценить"],
              ].map(([value, label]) =>
                renderChoice(
                  value,
                  label,
                  form.gpa_quantile === value,
                  () => updateField("gpa_quantile", value),
                ),
              )}
            </div>
          </>
        );

      case 6:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-4 text-center">Участие в розыгрыше</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-muted/10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.wants_raffle}
                  onChange={(e) => updateField("wants_leaderboard", e.target.checked)}
                />
                <span>Хочу участвовать в розыгрыше</span>
              </label>
            </div>
          </>
        );

      case 7:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-3 text-center">Идентификатор участника</h2>
            <p className="text-sm text-muted-foreground mb-4 text-center leading-7">
              Ниже указан ваш ID участника. Скопируйте и сохраните его - он понадобится
              для розыгрыша.
            </p>

            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-6 text-center">
              <div className="text-3xl font-semibold tracking-wide">
                {participantId || "ID ещё не создан"}
              </div>

              <button
                type="button"
                disabled={!participantId}
                onClick={handleCopyParticipantId}
                className="mt-4 w-full rounded-xl px-4 py-3 border border-white/10 bg-muted/10 disabled:opacity-50"
              >
                {copiedParticipantId ? "Скопировано!" : "Скопировать ID"}
              </button>
            </div>
          </>
        );

      case 8:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-2 text-center">Введите email</h2>
            <p className="text-sm text-muted-foreground mb-3 text-center">
              На него придёт одноразовый код
            </p>
            <input
              className="w-full rounded-xl bg-muted/10 border border-white/10 px-4 py-3 text-center"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />

            <button
              type="button"
              disabled={loading || !form.email.trim()}
              onClick={handleCreateAndSendCode}
              className={
                "mt-4 w-full rounded-xl px-4 py-3 border text-base " +
                (loading || !form.email.trim()
                  ? "bg-muted/10 border-white/10 opacity-50 cursor-not-allowed"
                  : "bg-blue-500/25 border-blue-400/60")
              }
            >
              {loading ? "Отправляем..." : "Отправить код"}
            </button>
          </>
        );

      case 9:
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">{sectionTitle}</p>
            <h2 className="text-xl font-semibold mb-2 text-center">Подтверждение email</h2>
            <p className="text-sm text-muted-foreground mb-3 text-center">
              Мы отправили код на {form.email}
            </p>
            <input
              className="w-full rounded-xl bg-muted/10 border border-white/10 px-4 py-3 text-center"
              placeholder="Введите 6 цифр"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <button
              type="button"
              disabled={loading || code.trim().length !== 6}
              onClick={handleVerifyCode}
              className={
                "mt-4 w-full rounded-xl px-4 py-3 border text-base " +
                (loading || code.trim().length !== 6
                  ? "bg-muted/10 border-white/10 opacity-50 cursor-not-allowed"
                  : "bg-blue-500/25 border-blue-400/60")
              }
            >
              {loading ? "Проверяем..." : "Подтвердить код"}
            </button>
          </>
        );

      default:
        return null;
    }
  }

  const showBack = step > 0 && step < 9;
  const showNext = step < 9 && step !== 8;

  if (!hydrated) {
    return (
      <div className="gradient-mesh min-h-screen min-h-[100dvh] p-3">
        <div className="max-w-xl mx-auto glass rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Загружаем…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] p-3">
      <div className="max-w-xl mx-auto glass rounded-2xl p-5">
        <div className="mb-4">
          <div className="text-sm text-muted-foreground">
            Шаг {Math.min(step + 1, TOTAL_STEPS)} / {TOTAL_STEPS}
          </div>
          <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400/70 transition-all"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}

        {error ? (
          <div className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
            {error}
          </div>
        ) : null}

        <div className="flex gap-2 mt-6">
          {showBack && (
            <button
              type="button"
              onClick={prevStep}
              className="rounded-xl px-4 py-3 bg-muted/10 border border-white/10"
            >
              Назад
            </button>
          )}

          {showNext && (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canGoNext || loading}
              className={
                "ml-auto rounded-xl px-4 py-3 border " +
                (canGoNext && !loading
                  ? "bg-blue-500/25 border-blue-400/60"
                  : "bg-muted/10 border-white/10 opacity-50 cursor-not-allowed")
              }
            >
              {loading ? "Загрузка..." : "Далее"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}