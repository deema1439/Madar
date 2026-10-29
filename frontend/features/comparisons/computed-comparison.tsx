"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, LoaderCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SafeMarkdown } from "@/features/insights/analysis-ui";
import { useIdentity } from "@/features/account/identity";
import type { SavedProperty } from "@/lib/api/contracts";
import { apiLanguage } from "@/lib/api/config";
import { credits } from "@/lib/api/credits";
import { insights } from "@/lib/api/insights";
import type { ComputedComparison } from "@/lib/api/insight-contracts";
import { ApiError } from "@/lib/api/errors";

function formatCredits(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} ${locale === "ar" ? "رصيد" : "credits"}`;
}

function ComparisonScores({ data }: { data: ComputedComparison }) {
  const t = useTranslations("Workspace");
  const locale = useLocale();
  const values = [
    ["matchScore", "match"],
    ["housingScore", "housing"],
    ["commuteScore", "commute"],
    ["servicesScore", "servicesScore"],
  ] as const;
  return (
    <Card className="rounded-2xl border-border/70 shadow-panel">
      <CardHeader>
        <CardTitle>{t("comparisonSuitability")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          {data.properties.map((property) => (
            <div
              key={
                property.savedPropertyId ??
                `${property.source}:${property.externalPropertyId}`
              }
              className="rounded-xl bg-secondary/40 p-4"
            >
              <h3 className="font-medium">
                {property.title || property.externalPropertyId}
              </h3>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {values.map(([key, label]) => {
                  const score = property[key];
                  return (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">
                        {t(`comparisonMetric.${label}`)}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">
                        {score == null
                          ? t("comparisonUnavailable")
                          : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(score)}%`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
        {data.aiAnalysis ? (
          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-2 font-semibold">{t("comparisonAiExplanation")}</h3>
            {data.aiAnalysis.reason ? (
              <SafeMarkdown text={data.aiAnalysis.reason} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("comparisonUnavailable")}
              </p>
            )}
            {data.aiAnalysis.alternativeReason || data.aiAnalysis.tradeOff ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("comparisonTradeoffs")}
                </summary>
                {data.aiAnalysis.alternativeReason ? (
                  <SafeMarkdown text={data.aiAnalysis.alternativeReason} />
                ) : null}
                {data.aiAnalysis.tradeOff ? (
                  <SafeMarkdown text={data.aiAnalysis.tradeOff} />
                ) : null}
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("comparisonNoAiExplanation")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ComputedComparisonPanel({ properties }: { properties: SavedProperty[] }) {
  const locale = useLocale();
  const t = useTranslations("Workspace");
  const { userId } = useIdentity();
  const cache = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<ComputedComparison>();
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
  const cost = prices.data?.AI_COMPARISON;
  const mutation = useMutation({
    mutationFn: () => {
      if (properties.length === 2) {
        const [first, second] = properties;

        return insights.compareTwo(
            first.source,
            first.externalPropertyId,
            second.source,
            second.externalPropertyId,
            apiLanguage(locale),
        );
      }

      return insights.compareMultiple(
          properties.map((property) => property.id!),
          apiLanguage(locale),
      );
    },
    retry: 0,
    onMutate: () => setResult(undefined),
    onSuccess: (data) => {
      setResult(data);
      setConfirmOpen(false);
    },
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["credit-balance", userId] }),
        cache.invalidateQueries({ queryKey: ["credit-transactions", userId] }),
      ]);
    },
  });
  const canAnalyze =
    properties.length >= 2 &&
    properties.length <= 4 &&
    properties.every((property) => property.id != null);
  const insufficient =
    cost != null && balance.data != null && balance.data.balance < cost;
  const insufficientError =
    mutation.error instanceof ApiError &&
    mutation.error.backendMessage?.includes("رصيدك من الكريدت") === true;
  const prerequisiteError =
    mutation.error instanceof ApiError &&
    [
      "Housing preferences not found",
      "Property has insufficient data for matching",
      "Housing budget is invalid",
    ].includes(mutation.error.backendMessage ?? "");
  const providerError =
    mutation.error instanceof ApiError &&
    (mutation.error.status === 502 ||
      [
        "AI comparison explanation was not returned",
        "AI explanations were not returned",
        "AI is unavailable right now",
      ].includes(mutation.error.backendMessage ?? ""));

  return (
    <section className="flex flex-col gap-4">
      <Card className="rounded-2xl border-border/70 shadow-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles
              aria-hidden="true"
              className="size-5 text-primary"
            />
            {t("comparisonSuitability")}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("paidComparisonDescription")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {prices.isError ? (
            <ErrorState
              error={prices.error}
              retry={() => void prices.refetch()}
            />
          ) : null}
          {balance.isError ? (
            <ErrorState
              error={balance.error}
              retry={() => void balance.refetch()}
            />
          ) : null}
          {cost != null ? (
            <p className="text-sm text-muted-foreground">
              {t("paidComparisonCost", { cost: formatCredits(cost, locale) })}
            </p>
          ) : null}
          {balance.data ? (
            <p className="text-sm text-muted-foreground">
              {t("creditBalanceLabel", {
                balance: formatCredits(balance.data.balance, locale),
              })}
            </p>
          ) : null}
          {insufficient ? (
            <Button
              nativeButton={false}
              render={<Link href="/payments" />}
              variant="outline"
            >
              {t("buyCredits")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={
              !canAnalyze ||
              cost == null ||
              prices.isPending ||
              balance.isPending ||
              insufficient ||
              mutation.isPending
            }
            onClick={() => {
              mutation.reset();
              setConfirmOpen(true);
            }}
          >
            {mutation.isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {t("requestPaidComparison")}
          </Button>
        </CardContent>
        {mutation.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 px-6 pb-5 text-sm text-destructive"
          >
            <p>
              {insufficientError
                ? t("comparisonInsufficientCredits")
                : prerequisiteError
                  ? t("comparisonPrerequisiteError")
                  : providerError
                    ? t("comparisonProviderError")
                    : t("paidComparisonError")}
            </p>
            {insufficientError ? (
              <Button
                nativeButton={false}
                render={<Link href="/payments" />}
                variant="outline"
              >
                {t("buyCredits")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
      {result ? <ComparisonScores data={result} /> : null}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => !mutation.isPending && setConfirmOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmPaidComparisonTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmPaidComparisonDescription", {
                cost: cost == null ? "—" : formatCredits(cost, locale),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || cost == null || insufficient}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? t("working") : t("confirmPaidComparison")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
