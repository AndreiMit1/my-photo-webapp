"use client";

import { useRouter } from "next/navigation";

export default function ConsentPage() {
  const router = useRouter();

  function handleAgree() {
    localStorage.setItem("experiment_consent", "accepted");
    router.push("/survey");
  }

  function handleDecline() {
    localStorage.removeItem("experiment_consent");
    router.push("/declined");
  }

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] px-4 py-6 md:px-6 md:py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-4">
          <p className="text-base md:text-lg font-semibold text-yellow-200">
            Рекомендуется проходить эксперимент с компьютера или ноутбука.
          </p>
        </div>

        <div className="glass rounded-3xl p-6 md:p-10">
          <div className="mb-8">
            <p className="text-sm text-muted-foreground mb-3 tracking-wide">
              Согласие на участие
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
              Участие в исследовательском эксперименте
            </h1>
          </div>

          <div className="space-y-6 text-base md:text-lg text-foreground/90 leading-9 text-justify">
            <p>
              Вам предлагается принять участие в исследовании, посвящённом
              восприятию динамики временных рядов и принятию решений в условиях
              краткосрочного прогнозирования.
            </p>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <p>
                Эксперимент состоит из двух частей. Сначала необходимо пройти
                короткую анкету. После этого на экране будет показан временной
                ряд, для которого нужно последовательно дать прогноз следующих
                значений на горизонтах <strong>T+1, T+2, T+4, T+5, T+7 и T+8</strong>.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-5 py-4">
              <p>
                <strong>Средняя продолжительность участия</strong> - около 10 минут.
              </p>
            </div>

            <p>
              Результаты эксперимента будут использоваться исключительно в
              исследовательских целях - для анализа данных и подготовки
              исследовательской работы. В итоговых материалах будут использоваться
              только обезличенные результаты, без сведений, позволяющих установить
              личность участника.
            </p>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4">
              <p>
                <strong>Всем участникам</strong> после завершения эксперимента
                будет предоставлено вознаграждение.
              </p>
            </div>

            <p>
              При согласии на получение вознаграждения после завершения
              эксперимента вам будет предложено отдельно указать необходимые для
              этого данные. Эти сведения будут собираться отдельно от результатов
              тестирования.
            </p>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <p>
                При согласии на участие в рейтинговой таблице каждому участнику
                будет присвоен индивидуальный ID. В рейтинговой таблице будут
                отображаться ID участника, а также указанные в анкете вуз и
                факультет.
              </p>
            </div>

            <p>
              Нажимая кнопку согласия, вы подтверждаете, что ознакомились с
              условиями участия и добровольно соглашаетесь пройти эксперимент.
            </p>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleAgree}
              className="flex-1 rounded-2xl px-5 py-3 bg-blue-500/25 border border-blue-400/60 text-base md:text-lg"
            >
              Согласен(а), продолжить
            </button>

            <button
              type="button"
              onClick={handleDecline}
              className="flex-1 rounded-2xl px-5 py-3 bg-muted/10 border border-white/10 text-base md:text-lg"
            >
              Не согласен(а)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}