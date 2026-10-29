
"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowUpLeft,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  MapPin,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

import { useIdentity } from "@/features/account/identity";
import { useProfileCompletion } from "@/features/account/api/query-hooks";
import { SummarySkeleton } from "@/components/shared/page-skeleton";
import { QueryFeedback } from "@/components/shared/query-feedback";
import { getLayoutCopy } from "@/messages/layout-copy";
import { ErrorState } from "@/components/shared/error-state";

export function ProfileCompletionPanel() {
  const locale = useLocale();
  const ar = locale === "ar";
  const copy = getLayoutCopy(locale);
  const { userId } = useIdentity();
  const query = useProfileCompletion(userId);
  const t = useTranslations("profile");

  if (query.isPending) return <SummarySkeleton />;

  if (query.isError && !query.data) {
    return (
        <ErrorState
            error={query.error}
            retry={() => void query.refetch()}
        />
    );
  }

  const data = query.data;
  const percentage = Math.max(
      0,
      Math.min(100, data.completionPercentage),
  );

  const steps = [
    {
      title: ar ? "تفضيلات السكن" : "Housing preferences",
      href: "/profile" as const,
      done: data.housingCompleted,
      icon: SlidersHorizontal,
    },
    {
      title: ar ? "الأماكن المهمة" : "Important places",
      href: "/locations" as const,
      done: data.placesCompleted,
      icon: MapPin,
    },
    {
      title: ar ? "اهتماماتك" : "Lifestyle interests",
      href: "/interests" as const,
      done: data.interestsCompleted,
      icon: Sparkles,
    },
    {
      title: ar
          ? "التوصيات المناسبة لك"
          : "Personalized recommendations",
      href: "/dashboard" as const,
      done: false,
      available: data.readyForSearch,
      icon: ClipboardList,
    },
  ];

  const completedCount = steps
      .slice(0, 3)
      .filter((step) => step.done).length;

  const missingItems = data.missingFeatures.filter(
      (item) =>
          ![
            "HOUSING_PREFERENCE",
            "IMPORTANT_LOCATIONS",
            "INTERESTS",
          ].includes(item.feature),
  );

  return (
      <section className="w-full overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
        <div className="p-5 sm:p-6">
          <QueryFeedback query={query} />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList className="size-5" />
            </span>

              <div className="min-w-0">
                <h2 className="text-base font-semibold">
                  {copy.profileProgress}
                </h2>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  {data.readyForSearch
                      ? copy.completionReady
                      : copy.completionOptional}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-primary">
            <span className="text-xl font-bold tabular-nums">
              {new Intl.NumberFormat(locale, {
                style: "percent",
                maximumFractionDigits: 0,
              }).format(percentage / 100)}
            </span>
              <CheckCircle2 className="size-4" />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{copy.summary}</span>
              <span className="font-medium tabular-nums">
              {ar
                  ? `${completedCount} من 3 خطوات`
                  : `${completedCount} of 3 steps`}
            </span>
            </div>

            <progress
                aria-label={copy.profileProgress}
                value={percentage}
                max={100}
                className="block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary"
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              const available = "available" in step
                  ? step.available
                  : undefined;

              const statusText = step.done
                  ? ar
                      ? "مكتمل"
                      : "Complete"
                  : available === false
                      ? ar
                          ? "بعد التفضيلات"
                          : "After preferences"
                      : available === true
                          ? ar
                              ? "جاهز"
                              : "Ready"
                          : ar
                              ? "اختياري"
                              : "Optional";

              return (
                  <Link
                      key={step.href}
                      href={step.href}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-secondary/10 px-3 py-3 transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                        step.done
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                    }`}
                >
                  {step.done ? (
                      <Check className="size-4" />
                  ) : (
                      <Icon className="size-4" />
                  )}
                </span>

                    <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">
                    {step.title}
                  </span>
                  <span
                      className={`mt-1 block text-[11px] ${
                          step.done
                              ? "text-primary"
                              : "text-muted-foreground"
                      }`}
                  >
                    {statusText}
                  </span>
                </span>

                    <ArrowUpLeft className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
                  </Link>
              );
            })}
          </div>

          {missingItems.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
                {missingItems.map((item) => {
                  const key = item.messageKey.replace(
                      /^profile\./,
                      "",
                  );

                  return (
                      <Link
                          key={item.feature}
                          href="/profile"
                          className="inline-flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-secondary"
                      >
                        <Circle className="size-2.5" />
                        {t.has(key) ? t(key) : copy.profileTitle}
                      </Link>
                  );
                })}
              </div>
          )}
        </div>
      </section>
  );
}
