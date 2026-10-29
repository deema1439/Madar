
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  House,
  MapPin,
  Route,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

import { useCurrentUserId } from "@/features/account/session-hooks";
import { useHousing } from "@/features/account/api/query-hooks";
import { insights } from "@/lib/api/insights";
import { savedPropertiesApi } from "@/lib/api/saved-properties";
import type { RecommendationWeights } from "@/lib/api/insight-contracts";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { SummarySkeleton } from "@/components/shared/page-skeleton";
import { GoogleDataAttribution } from "@/components/maps/google-data-attribution";
import {
  categoryLabel,
  straightLineDistance,
} from "@/lib/maps/place-presentation";
import { QueryFeedback } from "@/components/shared/query-feedback";
import { ErrorState } from "@/components/shared/error-state";
import { Panel } from "@/components/shared/panel";
import { ScoreFacts } from "@/features/insights/analysis-ui";
import { Link } from "@/i18n/navigation";

type SearchPriority = "balanced" | "housing" | "commute" | "services";

const priorityWeights: Record<
    Exclude<SearchPriority, "balanced">,
    RecommendationWeights
> = {
  housing: {
    housingWeight: 60,
    commuteWeight: 25,
    servicesWeight: 15,
  },
  commute: {
    housingWeight: 25,
    commuteWeight: 60,
    servicesWeight: 15,
  },
  services: {
    housingWeight: 25,
    commuteWeight: 15,
    servicesWeight: 60,
  },
};

export function PersonalPropertyInsights(props: {
  source: string;
  externalId: string;
}) {
  const userId = useCurrentUserId();
  const t = useTranslations("PropertyInsights");

  if (!userId) {
    return (
        <p className="text-sm">
          {t("optional")}{" "}
          <Link href="/login" className="text-primary underline">
            {t("signIn")}
          </Link>
        </p>
    );
  }

  return (
      <UserPropertyInsights
          key={`${userId}:${props.source}:${props.externalId}`}
          userId={userId}
          {...props}
      />
  );
}

function UserPropertyInsights({
                                userId,
                                source,
                                externalId,
                              }: {
  userId: number;
  source: string;
  externalId: string;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const t = useTranslations("PropertyInsights");

  const housing = useHousing(userId);

  const [budget, setBudget] = useState(false);
  const [priority, setPriority] = useState<SearchPriority>("balanced");
  const [scoreRequest, setScoreRequest] = useState<{
    weights?: RecommendationWeights;
  } | null>(null);
  const [savedRequest, setSavedRequest] = useState(false);
  const [interestsRequest, setInterestsRequest] = useState(false);

  const affordability = useQuery({
    queryKey: ["affordability", userId, source, externalId],
    queryFn: ({ signal }) =>
        insights.affordability(source, externalId, signal),
    enabled: budget && !!housing.data,
    retry: false,
  });

  const match = useQuery({
    queryKey: ["match-score", userId, source, externalId, scoreRequest],
    queryFn: ({ signal }) =>
        insights.match(source, externalId, scoreRequest?.weights, signal),
    enabled: !!scoreRequest && !!housing.data,
    retry: false,
  });

  const supportsInterests =
      source.toUpperCase() === "KITE" && /^\d{1,19}$/.test(externalId);

  const essential = useQuery({
    queryKey: ["property-interests", userId, source, externalId],
    queryFn: ({ signal }) =>
        insights.propertyInterests(source, externalId, signal),
    enabled: interestsRequest && !!housing.data && supportsInterests,
    retry: false,
  });

  const saved = useQuery({
    queryKey: ["saved-check", userId, source, externalId],
    queryFn: ({ signal }) =>
        savedPropertiesApi.check(source, externalId, signal),
    enabled: savedRequest,
    retry: false,
  });

  const priorities = [
    {
      id: "balanced" as const,
      title: ar ? "متوازن" : "Balanced",
      description: ar
          ? "توازن بين السكن والتنقل والخدمات"
          : "Balance housing, commute, and services",
      icon: SlidersHorizontal,
    },
    {
      id: "housing" as const,
      title: ar ? "السكن" : "Housing",
      description: ar
          ? "أعطِ مواصفات البيت أولوية أكبر"
          : "Prioritize home features",
      icon: House,
    },
    {
      id: "commute" as const,
      title: ar ? "التنقل" : "Commute",
      description: ar
          ? "ركّز على سهولة الوصول لمشاويرك"
          : "Prioritize your commute",
      icon: Route,
    },
    {
      id: "services" as const,
      title: ar ? "الخدمات" : "Services",
      description: ar
          ? "اهتم بالخدمات القريبة من البيت"
          : "Prioritize nearby services",
      icon: MapPin,
    },
  ];

  const selectedWeights =
      priority === "balanced" ? undefined : priorityWeights[priority];

  const formatMoney = (value: number) =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }).format(value);

  return (
      <Panel title={t("title")} description={t("description")}>
        <div className="flex min-w-0 flex-col gap-6">
          {housing.isPending ? (
              <SummarySkeleton />
          ) : housing.isError && !housing.data ? (
              <ErrorState
                  error={housing.error}
                  retry={() => void housing.refetch()}
              />
          ) : !housing.data ? (
              <Link
                  href="/profile"
                  className="text-sm text-primary underline"
              >
                {t("addPreferences")}
              </Link>
          ) : (
              <>
                {/* Priority selection */}
                <section className="space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold">
                      {ar
                          ? "وش الأهم لك في هذا البيت؟"
                          : "What matters most to you in this home?"}
                    </h3>

                    <p className="text-sm leading-6 text-muted-foreground">
                      {ar
                          ? "اختر أولويتك، ومدار يحسب لك مدى مناسبة البيت بناءً عليها."
                          : "Choose your priority and Madar will calculate how well this home matches it."}
                    </p>
                  </div>

                  <div
                      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                      role="group"
                      aria-label={
                        ar ? "أولوية تقييم البيت" : "Home evaluation priority"
                      }
                  >
                    {priorities.map((option) => {
                      const Icon = option.icon;
                      const active = priority === option.id;

                      return (
                          <button
                              key={option.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setPriority(option.id)}
                              className={`relative flex min-w-0 flex-col items-start gap-3 rounded-2xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                  active
                                      ? "border-primary bg-primary/5"
                                      : "border-border/70 bg-background hover:border-primary/40 hover:bg-secondary/30"
                              }`}
                          >
                            <div className="flex w-full items-center justify-between gap-3">
                        <span
                            className={`flex size-9 items-center justify-center rounded-xl ${
                                active
                                    ? "bg-primary/10 text-primary"
                                    : "bg-secondary text-foreground"
                            }`}
                        >
                          <Icon
                              className="size-4"
                              aria-hidden="true"
                          />
                        </span>

                              {active ? (
                                  <Check
                                      className="size-4 text-primary"
                                      aria-hidden="true"
                                  />
                              ) : null}
                            </div>

                            <div className="space-y-1">
                              <p className="text-sm font-semibold">
                                {option.title}
                              </p>
                              <p className="text-xs leading-5 text-muted-foreground">
                                {option.description}
                              </p>
                            </div>
                          </button>
                      );
                    })}
                  </div>
                </section>

                {/* Actions */}
                <section className="space-y-3 border-t border-border/60 pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">
                        {ar ? "هل يناسبك هذا البيت؟" : "Is this home right for you?"}
                      </h3>

                      <p className="text-sm text-muted-foreground">
                        {ar
                            ? "قارن سعره بميزانيتك، أو احسب مدى مطابقته لتفضيلاتك."
                            : "Compare its price with your budget or calculate its match with your preferences."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                          type="button"
                          variant="outline"
                          disabled={affordability.isFetching}
                          onClick={() => {
                            if (budget) void affordability.refetch();
                            else setBudget(true);
                          }}
                          className="rounded-xl"
                      >
                        <Wallet
                            className="size-4"
                            aria-hidden="true"
                        />
                        {t("compareBudget")}
                      </Button>

                      <Button
                          type="button"
                          disabled={match.isFetching}
                          onClick={() => {
                            const next = { weights: selectedWeights };

                            if (
                                JSON.stringify(next) ===
                                JSON.stringify(scoreRequest)
                            ) {
                              void match.refetch();
                            } else {
                              setScoreRequest(next);
                            }
                          }}
                          className="rounded-xl"
                      >
                        {t("calculateMatch")}
                      </Button>
                    </div>
                  </div>
                </section>
              </>
          )}

          {/* Budget result */}
          {budget ? (
              <section className="space-y-3">
                <QueryFeedback query={affordability} />

                {affordability.isPending ? (
                    <SummarySkeleton />
                ) : affordability.isError && !affordability.data ? (
                    <>
                      {affordability.error instanceof ApiError &&
                      affordability.error.backendMessage ===
                      "Property price is unavailable" ? (
                          <p className="text-sm">
                            {t("priceUnavailable")}
                          </p>
                      ) : null}

                      <ErrorState
                          error={affordability.error}
                          retry={() => void affordability.refetch()}
                          retryDisabled={affordability.isFetching}
                      />
                    </>
                ) : affordability.data ? (
                    <div className="rounded-2xl border border-border/70 bg-secondary/20 p-5 sm:p-6">
                      <div className="mb-5 space-y-1">
                        <h3 className="text-base font-semibold">
                          {ar ? "مقارنة الميزانية" : "Budget comparison"}
                        </h3>

                        <p className="text-sm font-medium">
                          {affordability.data.withinBudget
                              ? t("withinBudget")
                              : t("overBudget")}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background p-4">
                          <p className="text-xs text-muted-foreground">
                            {t("price")}
                          </p>
                          <p className="mt-2 text-xl font-semibold tabular-nums">
                            {formatMoney(affordability.data.propertyPrice)}
                            <span className="ms-1 text-xs font-normal text-muted-foreground">
                        {t("currency")}
                      </span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-background p-4">
                          <p className="text-xs text-muted-foreground">
                            {t("budget")}
                          </p>
                          <p className="mt-2 text-xl font-semibold tabular-nums">
                            {formatMoney(affordability.data.userBudget)}
                            <span className="ms-1 text-xs font-normal text-muted-foreground">
                        {t("currency")}
                      </span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>{t("difference")}:</span>
                        <span className="font-semibold text-foreground">
                    <bdi>
                      {new Intl.NumberFormat(locale, {
                        signDisplay: "always",
                      }).format(
                          affordability.data.priceDifference,
                      )}
                    </bdi>{" "}
                          {t("currency")}
                  </span>
                        <span aria-hidden="true">·</span>
                        <span>
                    {affordability.data.differencePercentage}%{" "}
                          {t("ofBudget")}
                  </span>
                      </div>
                    </div>
                ) : null}
              </section>
          ) : null}

          {/* Match result */}
          {scoreRequest ? (
              <section className="space-y-3">
                <QueryFeedback query={match} />

                {match.isPending ? (
                    <SummarySkeleton />
                ) : match.isError && !match.data ? (
                    <ErrorState
                        error={match.error}
                        retry={() => void match.refetch()}
                        retryDisabled={match.isFetching}
                    />
                ) : match.data ? (
                    <div className="rounded-2xl border border-border/70 bg-background p-5 sm:p-6">
                      <div className="mb-5 space-y-1">
                        <h3 className="text-base font-semibold">
                          {ar ? "مدى مناسبة البيت لك" : "Your home match"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {ar
                              ? "هذه نتيجة التقييم بناءً على تفضيلاتك والأولوية اللي اخترتها."
                              : "This evaluation is based on your preferences and selected priority."}
                        </p>
                      </div>

                      <ScoreFacts
                          match={match.data.matchScore}
                          housing={match.data.housingScore}
                          commute={match.data.commuteScore}
                          services={match.data.servicesScore}
                      />
                    </div>
                ) : null}
              </section>
          ) : null}

          {/* Nearby interests */}
          {housing.data && supportsInterests ? (
              <section className="space-y-3 border-t border-border/60 pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">
                      {ar
                          ? "الأماكن اللي تهمك"
                          : "Places that matter to you"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {ar
                          ? "استكشف الأماكن القريبة المرتبطة باهتماماتك."
                          : "Explore nearby places based on your interests."}
                    </p>
                  </div>

                  <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-xl"
                      disabled={essential.isFetching}
                      onClick={() => {
                        if (interestsRequest) void essential.refetch();
                        else setInterestsRequest(true);
                      }}
                  >
                    {t("nearbyInterests")}
                  </Button>
                </div>

                {interestsRequest ? (
                    <>
                      <QueryFeedback query={essential} />

                      {essential.isPending ? (
                          <SummarySkeleton />
                      ) : essential.isError && !essential.data ? (
                          <ErrorState
                              error={essential.error}
                              retry={() => void essential.refetch()}
                              retryDisabled={essential.isFetching}
                          />
                      ) : !essential.data?.length ? (
                          <p className="text-sm">{t("noInterests")}</p>
                      ) : (
                          <ul className="grid gap-3 sm:grid-cols-2">
                            {essential.data.map((item) => (
                                <li
                                    key={item.category}
                                    className="rounded-xl border border-border/70 bg-background p-4 text-sm"
                                >
                                  <h3 className="font-medium">
                                    {categoryLabel(item.category, locale)}
                                  </h3>

                                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                                    {item.status === "SEARCH_FAILED"
                                        ? t("searchFailed")
                                        : item.status === "NO_MATCH"
                                            ? t("noMatch")
                                            : `${
                                                item.place?.displayName?.text ||
                                                t("unnamedPlace")
                                            } · ${straightLineDistance(
                                                item.straightLineDistanceMeters,
                                                locale,
                                            )}`}
                                  </p>

                                  {item.status === "SEARCH_FAILED" ? (
                                      <Button
                                          type="button"
                                          variant="link"
                                          size="sm"
                                          disabled={essential.isFetching}
                                          onClick={() =>
                                              void essential.refetch()
                                          }
                                      >
                                        {t("retrySearch")}
                                      </Button>
                                  ) : null}
                                </li>
                            ))}
                          </ul>
                      )}
                    </>
                ) : null}
              </section>
          ) : null}

          {essential.data || match.data ? (
              <GoogleDataAttribution />
          ) : null}

          {/* Saved property check */}
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
            <Button
                type="button"
                variant="ghost"
                className="self-start rounded-xl"
                disabled={saved.isFetching}
                onClick={() => {
                  if (savedRequest) void saved.refetch();
                  else setSavedRequest(true);
                }}
            >
              {t("checkSaved")}
            </Button>

            {savedRequest ? (
                saved.isPending ? (
                    <SummarySkeleton />
                ) : saved.isError && saved.data === undefined ? (
                    <ErrorState
                        error={saved.error}
                        retry={() => void saved.refetch()}
                    />
                ) : (
                    <>
                      <QueryFeedback query={saved} />
                      <p role="status" className="text-sm">
                        {saved.data ? t("saved") : t("notSaved")}
                      </p>
                    </>
                )
            ) : null}
          </div>
        </div>
      </Panel>
  );
}
