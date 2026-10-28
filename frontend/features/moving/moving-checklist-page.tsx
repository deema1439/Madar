
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Home,
  Info,
  ListChecks,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { DeleteAction } from "@/components/shared/delete-action";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeading } from "@/components/shared/page-heading";
import { Button } from "@/components/ui/button";
import {
  useHomeStatus,
  useMovingChecklist,
} from "@/features/account/api/query-hooks";
import { useIdentity } from "@/features/account/identity";
import { ApiError } from "@/lib/api/errors";
import {
  movingChecklistApi,
  type MovingTask,
} from "@/lib/api/moving-checklist";

type Language = "ar" | "en";

function isMissingChecklist(error: unknown) {
  return (
      error instanceof ApiError &&
      error.backendMessage ===
      "Moving checklist not found, generate it first"
  );
}

function TaskList({
                    title,
                    tasks,
                    onToggle,
                    pending,
                  }: {
  title: string;
  tasks: MovingTask[];
  onToggle: (id: number) => void;
  pending: boolean;
}) {
  const t = useTranslations("Workspace");

  if (!tasks.length) return null;

  return (
      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ListChecks
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
          />
          <h2 className="font-semibold">{title}</h2>
        </div>

        <ul className="mt-3 divide-y divide-border/60">
          {tasks.map((task) => (
              <li
                  key={task.id}
                  className="flex items-start gap-3 py-3"
              >
                <input
                    type="checkbox"
                    checked={task.done}
                    disabled={pending}
                    onChange={() => onToggle(task.id)}
                    aria-label={t("toggleMovingTask", {
                      title: task.title,
                    })}
                    className="mt-1 size-4 shrink-0 accent-primary"
                />

                <span
                    className={
                      task.done
                          ? "text-sm leading-7 text-muted-foreground line-through"
                          : "text-sm leading-7"
                    }
                >
              {task.title}
            </span>
              </li>
          ))}
        </ul>
      </section>
  );
}

function MovingGuide({ language }: { language: Language }) {
  const isArabic = language === "ar";

  const steps = [
    {
      number: "01",
      title: isArabic ? "حدّد منزلك" : "Choose your home",
      description: isArabic
          ? "أضف البيت اللي ناوي تنتقل له من صفحة منزلي وحيّي."
          : "Add the home you plan to move into from My Home & Neighborhood.",
      icon: Home,
    },
    {
      number: "02",
      title: isArabic ? "جهّز انتقالك" : "Prepare your move",
      description: isArabic
          ? "أنشئ خطتك وتابع تجهيزاتك، وحدّد كل مهمة تنجزها."
          : "Generate your checklist, track preparations, and mark completed tasks.",
      icon: ClipboardCheck,
    },
    {
      number: "03",
      title: isArabic ? "أكّد انتقالك" : "Confirm your move",
      description: isArabic
          ? "بعد ما تنتقل فعليًا، أكّد سكنك للاستفادة من خدمات الحي."
          : "Once you've moved in, confirm your home to access neighborhood services.",
      icon: CheckCircle2,
    },
  ];

  return (
      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-panel sm:p-8">
        <p className="text-sm font-medium text-primary">
          {isArabic ? "دليلك قبل الانتقال" : "Your moving guide"}
        </p>

        <h2 className="mt-2 text-xl font-semibold leading-relaxed sm:text-2xl">
          {isArabic
              ? "من اختيار البيت إلى يوم الانتقال، خلّ أمورك مرتبة."
              : "From choosing your home to moving day, stay organized."}
        </h2>

        <p className="mt-3 max-w-2xl text-sm leading-8 text-muted-foreground">
          {isArabic
              ? "خطة الانتقال في مدار تساعدك تعرف وش عليك قبل السكن، من تحديث العنوان الوطني وتجهيز الإنترنت إلى نقل الخدمات. تابع المهام اللي أنجزتها، وقد يقترح مدار تجهيزات إضافية بناءً على معلومات العقار عند توفرها."
              : "MADAR helps you prepare for moving with essential tasks such as updating your national address, setting up internet, and transferring utilities. Track your progress and receive additional suggestions when property details are available."}
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
                <div
                    key={step.number}
                    className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                >
                  <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">
                  {step.number}
                </span>
                    <Icon
                        className="size-5 text-primary"
                        aria-hidden="true"
                    />
                  </div>

                  <h3 className="mt-3 font-semibold">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-secondary/40 p-4">
          <Info
              className="mt-1 size-4 shrink-0 text-primary"
              aria-hidden="true"
          />

          <p className="text-sm leading-7 text-muted-foreground">
            {isArabic
                ? "هذه الخطة مخصصة للتجهيز قبل الانتقال. إكمال المهام لا يعني تأكيد السكن تلقائيًا؛ تأكيد انتقالك خطوة مستقلة بعد السكن الفعلي."
                : "This checklist is for preparing before your move. Completing tasks does not automatically confirm that you've moved in."}
          </p>
        </div>
      </section>
  );
}
function HomeAction({
                        locale,
                        language,
                        movedIn = false,
                    }: {
    locale: string;
    language: Language;
    movedIn?: boolean;
}) {
    const isArabic = language === "ar";
    const DirectionIcon = isArabic ? ArrowLeft : ArrowRight;

    // ضعي هنا المسار الصحيح لصفحة منزلي وحيّي
    const homeHref = `/${locale}/neighborhood`;
    return (
        <Button
            asChild
            className="mt-6 h-11 rounded-xl px-6"
        >
            <Link
                href={homeHref}
                className="inline-flex flex-row items-center justify-center gap-2 whitespace-nowrap"
            >
                <Home className="size-4 shrink-0" aria-hidden="true" />

                <span>
          {movedIn
              ? isArabic
                  ? "انتقل إلى منزلي وحيّي"
                  : "Go to My Home"
              : isArabic
                  ? "أضف منزلك"
                  : "Add your home"}
        </span>

                <DirectionIcon
                    className="size-4 shrink-0"
                    aria-hidden="true"
                />
            </Link>
        </Button>
    );
}

export function MovingChecklistPage() {
  const locale = useLocale();
  const t = useTranslations("Workspace");
  const { userId } = useIdentity();
  const cache = useQueryClient();

  const language: Language = locale === "en" ? "en" : "ar";
  const isArabic = language === "ar";

  const query = useMovingChecklist(userId, language);
  const homeStatusQuery = useHomeStatus(userId);

  const homeStatus = homeStatusQuery.data?.status;
  const isNoHome = homeStatus === "NO_HOME";
  const isMovedIn = homeStatus === "MOVED_IN";
  const isHomeSet = homeStatus === "HOME_SET";

  const invalidate = () =>
      cache.invalidateQueries({
        queryKey: ["moving-checklist", userId],
        refetchType: "none",
      });

  const generate = useMutation({
    mutationFn: movingChecklistApi.generate,
    retry: 0,
    onSuccess: async () => {
      await invalidate();
      await query.refetch();
    },
  });

    const toggle = useMutation({
        mutationFn: movingChecklistApi.toggle,
        retry: 0,
        onSuccess: async () => {
            await cache.invalidateQueries({
                queryKey: ["moving-checklist", userId],
            });
        },
    });

  const reset = useMutation({
    mutationFn: movingChecklistApi.reset,
    retry: 0,
    onSuccess: async () => {
      await cache.resetQueries({
        queryKey: ["moving-checklist", userId],
      });
    },
  });

  const data = query.data;

  const percentage = data?.total
      ? Math.round((data.done / data.total) * 100)
      : 0;

  const busy =
      generate.isPending ||
      toggle.isPending ||
      reset.isPending;

  const checklistIsEmpty =
      isMissingChecklist(query.error) ||
      !data ||
      data.total === 0;

  return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
        <PageHeading
            title={t("movingChecklist")}
            description={t("movingChecklistDescription")}
        />

        <MovingGuide language={language} />

        {homeStatusQuery.isPending ? (
            <div
                role="status"
                className="space-y-3"
            >
              <div className="h-36 animate-pulse rounded-2xl bg-secondary" />
            </div>
        ) : homeStatusQuery.isError ? (
            <ErrorState
                error={homeStatusQuery.error}
                retry={() => void homeStatusQuery.refetch()}
            />
        ) : isNoHome ? (
            <section className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-panel sm:p-10">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <Home
                    className="size-8 text-primary"
                    aria-hidden="true"
                />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                {isArabic
                    ? "أول خطوة، حدّد البيت اللي بتنتقل له"
                    : "First, choose the home you're moving into"}
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted-foreground">
                {isArabic
                    ? "عشان يجهّز مدار خطة انتقال مناسبة لك، أضف منزلك أولًا من صفحة «منزلي وحيّي». بعدها ارجع هنا وأنشئ خطتك، وابدأ متابعة تجهيزاتك."
                    : "To create a moving checklist, first add your home from My Home & Neighborhood. Then return here to generate your plan and track your preparations."}
              </p>

              <HomeAction
                  locale={locale}
                  language={language}
              />
            </section>
        ) : isMovedIn && checklistIsEmpty ? (
            <section className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-panel sm:p-10">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle2
                    className="size-8 text-primary"
                    aria-hidden="true"
                />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                {isArabic
                    ? "تم تأكيد انتقالك"
                    : "Your move-in is confirmed"}
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted-foreground">
                {isArabic
                    ? "منزلك مسجّل الآن كمنزلك الحالي. خطة الانتقال مخصصة للتجهيز قبل السكن، وتقدر الآن تستكشف الخدمات والأماكن القريبة منك من صفحة «منزلي وحيّي»."
                    : "Your home is now confirmed. The moving checklist is designed for preparations before moving in. You can now explore nearby services from My Home & Neighborhood."}
              </p>

              <HomeAction
                  locale={locale}
                  language={language}
                  movedIn
              />
            </section>
        ) : query.isPending && !data ? (
            <div
                role="status"
                className="space-y-3"
            >
              <div className="h-28 animate-pulse rounded-2xl bg-secondary" />
              <div className="h-56 animate-pulse rounded-2xl bg-secondary" />
            </div>
        ) : query.isError &&
        !isMissingChecklist(query.error) &&
        !data ? (
            <ErrorState
                error={query.error}
                retry={() => void query.refetch()}
            />
        ) : checklistIsEmpty ? (
            <section className="rounded-3xl border border-dashed border-border bg-card p-6 text-center shadow-panel sm:p-10">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <ClipboardCheck
                    className="size-8 text-primary"
                    aria-hidden="true"
                />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                {t("movingChecklistEmptyTitle")}
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted-foreground">
                {isArabic
                    ? "حدّدت منزلك، وباقي نرتّب تجهيزات انتقالك. اضغط على إنشاء الخطة عشان يجهّز مدار قائمة المهام الأساسية، ويضيف اقتراحات مناسبة للعقار عند توفر معلوماته."
                    : "Your home is set. Generate a checklist of essential moving tasks, with additional property-specific suggestions when available."}
              </p>

              <Button
                  className="mt-6"
                  disabled={busy || !isHomeSet}
                  onClick={() => generate.mutate()}
              >
                {generate.isPending ? (
                    <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                    />
                ) : (
                    <CheckCircle2
                        className="size-4"
                        aria-hidden="true"
                    />
                )}

                {generate.isPending
                    ? t("working")
                    : t("generateMovingChecklist")}
              </Button>

              {generate.isError ? (
                  <div className="mx-auto mt-5 max-w-xl text-start">
                    <ErrorState error={generate.error} />
                  </div>
              ) : null}
            </section>
        ) : (
            <>
              {isMovedIn ? (
                  <section className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
                    <CheckCircle2
                        className="mt-1 size-5 shrink-0 text-primary"
                        aria-hidden="true"
                    />

                    <div>
                      <h2 className="font-semibold">
                        {isArabic
                            ? "تم تأكيد انتقالك إلى المنزل"
                            : "Your move-in is confirmed"}
                      </h2>

                      <p className="mt-1 text-sm leading-7 text-muted-foreground">
                        {isArabic
                            ? "هذه خطة الانتقال السابقة. تقدر تراجع المهام اللي أنجزتها."
                            : "This is your previous moving checklist. You can review your completed tasks."}
                      </p>
                    </div>
                  </section>
              ) : null}

              <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-panel sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {t("movingChecklistProgress", {
                        done: data!.done,
                        total: data!.total,
                      })}
                    </p>

                    <div
                        role="progressbar"
                        aria-label={t("movingChecklistProgressLabel")}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                        className="mt-3 h-2 w-56 max-w-full overflow-hidden rounded-full bg-secondary"
                    >
                      <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {isArabic
                          ? `${percentage}% من الخطة مكتمل`
                          : `${percentage}% of your checklist completed`}
                    </p>
                  </div>

                  {!isMovedIn ? (
                      <DeleteAction
                          label={t("resetMovingChecklist")}
                          title={t("resetMovingChecklistTitle")}
                          description={t("resetMovingChecklistDescription")}
                          confirmLabel={t("resetMovingChecklist")}
                          onDelete={() => reset.mutateAsync()}
                      />
                  ) : null}
                </div>

                {reset.isError ? (
                    <div className="mt-3">
                      <ErrorState error={reset.error} />
                    </div>
                ) : null}

                {toggle.isError ? (
                    <div className="mt-3">
                      <ErrorState error={toggle.error} />
                    </div>
                ) : null}
              </section>

              {data?.note ? (
                  <p className="rounded-xl bg-secondary/50 p-4 text-sm leading-7">
                    {data.note}
                  </p>
              ) : null}

              <TaskList
                  title={t("movingChecklistTasks")}
                  tasks={data?.movingTasks ?? []}
                  onToggle={(id) => toggle.mutate(id)}
                  pending={busy || isMovedIn}
              />

              <TaskList
                  title={t("movingOwnerChecks")}
                  tasks={data?.ownerChecks ?? []}
                  onToggle={(id) => toggle.mutate(id)}
                  pending={busy || isMovedIn}
              />

              {percentage === 100 && !isMovedIn ? (
                  <section className="rounded-2xl border border-border/70 bg-card p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                          className="mt-1 size-5 shrink-0 text-primary"
                          aria-hidden="true"
                      />

                      <div>
                        <h2 className="font-semibold">
                          {isArabic
                              ? "أحسنت، أنجزت جميع مهام خطتك!"
                              : "Great work! You've completed your checklist."}
                        </h2>

                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          {isArabic
                              ? "إذا انتقلت فعليًا إلى المنزل، تقدر تأكّد سكنك من صفحة «منزلي وحيّي». إكمال القائمة وحده ما يؤكد انتقالك."
                              : "Once you've actually moved in, you can confirm your home from My Home & Neighborhood. Completing this checklist does not confirm your move automatically."}
                        </p>
                      </div>
                    </div>

                    <HomeAction
                        locale={locale}
                        language={language}
                        movedIn
                    />
                  </section>
              ) : null}
            </>
        )}
      </main>
  );
}
