
"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Home,
  MapPin,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { Panel } from "@/components/shared/panel";
import { useIdentity } from "@/features/account/identity";
import { useHousing } from "@/features/account/api/query-hooks";
import { credits } from "@/lib/api/credits";
import { apiLanguage } from "@/lib/api/config";
import { insights } from "@/lib/api/insights";
import type { RecommendedProperty } from "@/lib/api/insight-contracts";
import { propertyHref } from "@/features/properties/format";
import { Link } from "@/i18n/navigation";

function formatPrice(value: number | null, locale: string) {
  if (value == null) return "—";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function RecommendedHome({ item }: { item: RecommendedProperty }) {
  const locale = useLocale();
  const t = useTranslations("Workspace");

  return (
      <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="min-w-0 flex-1 font-medium">
            {item.title ?? t("untitledProperty")}
          </h4>

          <Badge variant="secondary">
            {t("matchScoreLabel", { score: item.matchScore })}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {[item.city, item.neighborhood].filter(Boolean).join(" · ")}
        </p>

        <p className="text-sm font-semibold">
          {formatPrice(item.price, locale)}
        </p>

        {item.aiReason ? (
            <p
                dir="auto"
                className="text-start text-sm leading-7 text-muted-foreground"
            >
              {item.aiReason}
            </p>
        ) : null}

        <Button
            nativeButton={false}
            render={
              <Link
                  href={propertyHref({
                    source: item.source,
                    externalId: item.propertyId,
                  })}
              />
            }
            variant="outline"
            className="self-start"
        >
          {t("viewHomeDetails")}
        </Button>
      </article>
  );
}

export function NeighborhoodSuggestionsPanel() {
  const locale = useLocale();
  const ar = locale.startsWith("ar");
  const t = useTranslations("Workspace");

  const { userId } = useIdentity();
  const cache = useQueryClient();
  const housing = useHousing(userId);

  const [suggestions, setSuggestions] = useState<
      Awaited<ReturnType<typeof insights.suggestNeighborhoods>> | null
  >(null);

  const [selectedDistrictOverride, setSelectedDistrictOverride] = useState<
      string | null
  >(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  const selectedDistrict =
      selectedDistrictOverride ?? housing.data?.district ?? null;

  const homesInFlight = useRef(false);

  const prices = useQuery({
    queryKey: ["credit-service-prices", userId],
    queryFn: ({ signal }) => credits.servicePrices(signal),
    enabled: userId !== null,
  });

  const balance = useQuery({
    queryKey: ["credit-balance", userId],
    queryFn: ({ signal }) => credits.balance(signal),
    enabled: userId !== null,
  });

  const suggest = useMutation({
    mutationFn: () =>
        insights.suggestNeighborhoods(apiLanguage(locale)),
    retry: 0,
    onSuccess: (result) => {
      setSuggestions(result);
      setAnalysisExpanded(false);
    },
  });

  const select = useMutation({
    mutationFn: insights.selectNeighborhood,
    retry: 0,
    onSuccess: async (_result, district) => {
      setSelectedDistrictOverride(district);

      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["housing-preference", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["recommendations", userId],
        }),
      ]);
    },
  });

  const homes = useMutation({
    mutationFn: () =>
        insights.selectedNeighborhoodProperties(apiLanguage(locale)),
    retry: 0,
    onSuccess: () => setConfirmOpen(false),
    onSettled: async () => {
      homesInFlight.current = false;

      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["credit-balance", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["credit-transactions", userId],
        }),
      ]);
    },
  });

  const cost = prices.data?.TOP_3_RECOMMENDATIONS;

  const canRequestHomes =
      selectedDistrict &&
      cost != null &&
      balance.data != null &&
      balance.data.balance >= cost &&
      !homes.isPending;

  function requestHomes() {
    if (homesInFlight.current || !canRequestHomes) return;

    homesInFlight.current = true;
    homes.mutate();
  }

  const analysis = suggestions?.aiAnalysis?.trim() ?? "";
  const hasLongAnalysis = analysis.length > 320;

  return (
      <Panel
          title={t("neighborhoodSuggestionsTitle")}
          description={t("neighborhoodSuggestionsDescription")}
      >
        <div className="space-y-6">
          {/* Generate neighborhood suggestions */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/60 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>

              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {ar
                      ? "خلّ مدار يقترح لك الحي الأنسب"
                      : "Find a neighborhood that fits you"}
                </p>

                <p className="text-xs leading-6 text-muted-foreground">
                  {t("neighborhoodSuggestionsQuotaHint")}
                </p>
              </div>
            </div>

            <Button
                disabled={!housing.data || suggest.isPending}
                onClick={() => suggest.mutate()}
                className="w-full shrink-0 sm:w-auto"
            >
              <Sparkles data-icon="inline-start" />
              {suggest.isPending
                  ? t("working")
                  : t("suggestNeighborhoods")}
            </Button>
          </div>

          {suggest.isError ? (
              <ErrorState error={suggest.error} />
          ) : null}

          {suggestions ? (
              <div className="space-y-6">
                {/* AI explanation */}
                {analysis ? (
                    <section className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/25">
                      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-4 sm:px-5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                          <Sparkles className="size-4" aria-hidden="true" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold">
                            {ar
                                ? "ليش رشّح مدار هالأحياء؟"
                                : "Why these neighborhoods?"}
                          </h3>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {ar
                                ? "تحليل مبني على بيانات البحث وتفضيلاتك"
                                : "An analysis based on your preferences"}
                          </p>
                        </div>
                      </div>

                      <div className="px-4 py-4 sm:px-5">
                        <div
                            className={`relative overflow-hidden ${
                                !analysisExpanded && hasLongAnalysis
                                    ? "max-h-36"
                                    : ""
                            }`}
                        >
                          <p
                              dir="auto"
                              className="whitespace-pre-line break-words text-start text-sm leading-8 text-foreground/85"
                          >
                            {analysis}
                          </p>

                          {!analysisExpanded && hasLongAnalysis ? (
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-secondary/80 to-transparent" />
                          ) : null}
                        </div>

                        {hasLongAnalysis ? (
                            <button
                                type="button"
                                onClick={() =>
                                    setAnalysisExpanded((value) => !value)
                                }
                                className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-primary transition-opacity hover:opacity-70"
                                aria-expanded={analysisExpanded}
                            >
                              {analysisExpanded
                                  ? ar
                                      ? "عرض أقل"
                                      : "Show less"
                                  : ar
                                      ? "اقرأ التحليل كاملًا"
                                      : "Read full analysis"}

                              {analysisExpanded ? (
                                  <ChevronUp className="size-4" />
                              ) : (
                                  <ChevronDown className="size-4" />
                              )}
                            </button>
                        ) : null}
                      </div>
                    </section>
                ) : null}

                {/* Neighborhood cards */}
                <section className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-semibold tracking-tight sm:text-xl">
                        {ar
                            ? "الأحياء المقترحة لك"
                            : "Recommended neighborhoods"}
                      </h3>

                      <p className="text-xs leading-6 text-muted-foreground sm:text-sm">
                        {ar
                            ? "قارن الخيارات واختر الحي اللي يناسبك."
                            : "Compare your options and select a neighborhood."}
                      </p>
                    </div>

                    {suggestions.neighborhoods.length > 0 ? (
                        <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs text-muted-foreground">
                    {ar
                        ? `${suggestions.neighborhoods.length} أحياء`
                        : `${suggestions.neighborhoods.length} neighborhoods`}
                  </span>
                    ) : null}
                  </div>

                  {!suggestions.neighborhoods.length ? (
                      <p className="rounded-xl border border-border/70 p-5 text-sm text-muted-foreground">
                        {t("noNeighborhoodSuggestions")}
                      </p>
                  ) : (
                      <ul className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {suggestions.neighborhoods.map((item, index) => {
                          const isSelected =
                              selectedDistrict === item.district;

                          return (
                              <li
                                  key={item.district}
                                  className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background transition-colors ${
                                      isSelected
                                          ? "border-primary/70 bg-primary/[0.035] ring-1 ring-primary/15"
                                          : "border-border/70 hover:border-primary/30"
                                  }`}
                              >
                                <div className="flex flex-1 flex-col p-4 sm:p-5">
                                  <div className="mb-5 flex items-start justify-between gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-primary">
                                      <MapPin
                                          className="size-5"
                                          aria-hidden="true"
                                      />
                                    </div>

                                    {isSelected ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                <Check className="size-3.5" />
                                          {t("neighborhoodSelected")}
                              </span>
                                    ) : (
                                        <span className="text-xs font-medium text-muted-foreground">
                                {ar
                                    ? `الخيار ${index + 1}`
                                    : `Option ${index + 1}`}
                              </span>
                                    )}
                                  </div>

                                  <div className="mb-4 space-y-1.5">
                                    <h4
                                        dir="auto"
                                        className="break-words text-start text-xl font-semibold tracking-tight"
                                    >
                                      {item.district}
                                    </h4>

                                    <p className="text-xs text-muted-foreground">
                                      {t("sampledHomesCount", {
                                        count: item.sampledPropertyCount,
                                      })}
                                    </p>
                                  </div>

                                  {item.matchScore != null ? (
                                      <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-primary/[0.055] px-3 py-2.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                {ar
                                    ? "مدى التوافق"
                                    : "Match score"}
                              </span>

                                        <Badge variant="secondary">
                                          {t("matchScoreLabel", {
                                            score: item.matchScore,
                                          })}
                                        </Badge>
                                      </div>
                                  ) : null}

                                  <div className="mt-auto space-y-3 border-t border-border/60 pt-4">
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground">
                                        {ar
                                            ? "أقل سعر ضمن العقارات التي تمت مراجعتها"
                                            : "Lowest sampled property price"}
                                      </p>

                                      <p
                                          dir="auto"
                                          className="text-start text-base font-semibold tabular-nums"
                                      >
                                        {formatPrice(
                                            item.lowestSampledPrice,
                                            locale,
                                        )}
                                      </p>
                                    </div>

                                    {item.housingScore != null ? (
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {ar
                                      ? "تقييم ملاءمة السكن"
                                      : "Housing suitability"}
                                </span>

                                          <span className="text-xs font-semibold">
                                  {item.housingScore}
                                </span>
                                        </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="border-t border-border/60 p-3 sm:p-4">
                                  <Button
                                      className="w-full justify-center gap-2"
                                      size="sm"
                                      variant={isSelected ? "secondary" : "outline"}
                                      disabled={select.isPending}
                                      onClick={() => {
                                        if (!isSelected) homes.reset();
                                        select.mutate(item.district);
                                      }}
                                  >
                                    {isSelected ? (
                                        <Check className="size-4" />
                                    ) : (
                                        <MapPin className="size-4" />
                                    )}

                                    {isSelected
                                        ? t("neighborhoodSelected")
                                        : t("selectNeighborhood")}
                                  </Button>
                                </div>
                              </li>
                          );
                        })}
                      </ul>
                  )}
                </section>

                {/* Coverage note */}
                {suggestions.coverageNote ? (
                    <div className="rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                      <p
                          dir="auto"
                          className="break-words text-start text-xs leading-6 text-muted-foreground"
                      >
                        {suggestions.coverageNote}
                      </p>
                    </div>
                ) : null}

                {select.isError ? (
                    <ErrorState error={select.error} />
                ) : null}

                {/* Selected neighborhood and paid recommendations */}
                <section className="rounded-2xl border border-border/70 bg-background p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-primary">
                        <Home className="size-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 space-y-1.5">
                        <h3 className="text-sm font-semibold sm:text-base">
                          {ar
                              ? "اكتشف العقارات في الحي المختار"
                              : "Explore homes in your selected neighborhood"}
                        </h3>

                        {selectedDistrict ? (
                            <p className="break-words text-sm text-muted-foreground">
                              {ar ? "الحي المختار: " : "Selected: "}
                              <span
                                  dir="auto"
                                  className="font-medium text-foreground"
                              >
                          {selectedDistrict}
                        </span>
                            </p>
                        ) : (
                            <p className="text-sm leading-6 text-muted-foreground">
                              {ar
                                  ? "اختر أحد الأحياء المقترحة أولًا لعرض عقاراته."
                                  : "Select a suggested neighborhood to view its homes."}
                            </p>
                        )}

                        {cost != null ? (
                            <p className="text-xs leading-6 text-muted-foreground">
                              {t("neighborhoodHomesCost", {
                                cost,
                                balance: balance.data?.balance ?? "—",
                              })}
                            </p>
                        ) : null}
                      </div>
                    </div>

                    <Button
                        className="w-full shrink-0 lg:w-auto"
                        disabled={
                            !selectedDistrict ||
                            !canRequestHomes ||
                            prices.isError ||
                            balance.isError
                        }
                        onClick={() => setConfirmOpen(true)}
                    >
                      {t("homesInSelectedNeighborhood")}
                      <ArrowUpLeft className="size-4" />
                    </Button>
                  </div>

                  {cost != null &&
                  balance.data &&
                  balance.data.balance < cost ? (
                      <p className="mt-4 text-sm text-destructive">
                        {t("insufficientCredits")}{" "}
                        <Link href="/payments" className="underline">
                          {t("payments")}
                        </Link>
                      </p>
                  ) : null}

                  {prices.isError || balance.isError ? (
                      <div className="mt-4">
                        <ErrorState
                            error={prices.error ?? balance.error}
                        />
                      </div>
                  ) : null}

                  {homes.isError ? (
                      <div className="mt-4">
                        <ErrorState error={homes.error} />
                      </div>
                  ) : null}
                </section>

                {/* Existing recommended properties */}
                {homes.data?.recommendations?.length ? (
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          {ar
                              ? "العقارات المقترحة لك"
                              : "Recommended homes"}
                        </h3>

                        <p className="text-sm text-muted-foreground">
                          {ar
                              ? "استكشف العقارات التي رشّحها مدار."
                              : "Explore homes recommended for you."}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {homes.data.recommendations.map((item) => (
                            <RecommendedHome
                                key={`${item.source}:${item.propertyId}`}
                                item={item}
                            />
                        ))}
                      </div>
                    </section>
                ) : homes.isSuccess ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noSelectedNeighborhoodHomes")}
                    </p>
                ) : null}
              </div>
          ) : null}
        </div>

        {/* Preserve credit confirmation flow */}
        <AlertDialog
            open={confirmOpen}
            onOpenChange={(open) =>
                !homes.isPending && setConfirmOpen(open)
            }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("confirmNeighborhoodHomesTitle")}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {t("confirmNeighborhoodHomesDescription", {
                  district: selectedDistrict ?? "",
                  cost: cost ?? "—",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {balance.data &&
            cost != null &&
            balance.data.balance < cost ? (
                <p className="text-sm text-destructive">
                  {t("insufficientCredits")}
                </p>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={homes.isPending}>
                {t("cancel")}
              </AlertDialogCancel>

              <Button
                  disabled={!canRequestHomes}
                  onClick={requestHomes}
              >
                {homes.isPending
                    ? t("working")
                    : t("confirmAndContinue")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Panel>
  );
}
