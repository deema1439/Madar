"use client";
import { DisplayHeading } from "@/components/typography/display-heading";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useLocationTranslations } from "@/features/locations/use-location-translations";
import { apiLanguage } from "@/lib/api/config";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocationSelection } from "@/features/locations/location-hooks";
import { discovery } from "@/lib/api/discovery";
import { parseSearch } from "@/lib/api/discovery-contracts";
import { serializeQuery } from "@/lib/api/query";
import { usePreferenceSearch } from "./use-preference-search";
import { searchSnapshot, searchStateKey } from "./preference-search";
import { SearchForm } from "./components/search-form";
import { PropertyCard } from "./property-card";
import { PropertyGridSkeleton, SearchSkeleton } from "./skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { CompareSearchDialog } from "./compare-search-dialog";

export function PropertySearchPage() {
  const locale = useLocale();
  const ar = locale === "ar";
  const [compareFirst, setCompareFirst] = useState<
      Awaited<ReturnType<typeof discovery.search>>["data"][number] | null
  >(null);
  const language = apiLanguage(locale);
  const params = useSearchParams();
  const serialized = params.toString();

  const preferences = usePreferenceSearch(serialized);
  const parsed = parseSearch(new URLSearchParams(serialized));
  const t = useLocationTranslations();
  const location = useLocationSelection(
    params.get("city") || "",
    params.get("neighborhoodId") || "",
  );
  useEffect(() => {
    const next = new URLSearchParams(serialized);
    next.delete("region");
    next.delete("cityId");
    if (next.toString() !== serialized)
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${next}${window.location.hash}`,
      );
  }, [serialized]);
  const locationDraft = params.get("locationDraft") === "1";
  const filters =
    !preferences.initializing && parsed.success && location.ready && !locationDraft
      ? { ...parsed.data, lang: language }
      : undefined;
  const result = useInfiniteQuery({
    queryKey: ["property-search", filters ? serializeQuery(filters) : serialized],
    initialPageParam: filters?.cursor,
    queryFn: ({ pageParam, signal }) =>
      discovery.search({ ...filters!, cursor: pageParam }, signal),
    enabled: !!filters,
    staleTime: 60_000,
    refetchOnMount: false,
    getNextPageParam: (page, _pages, _last, previous) => {
      const p = page.pagination;
      return p.hasMore &&
        !p.resultWindowReached &&
        p.nextCursor &&
        !previous.includes(p.nextCursor)
        ? p.nextCursor
        : undefined;
    },
    retry: false,
  });
  const unique = new Set<string>();
  const properties =
    result.data?.pages
      .flatMap((page) => page.data)
      .filter((p, index) => {
        const key = p.externalId ? `${p.source}:${p.externalId}` : `missing:${index}`;
        if (unique.has(key)) return false;
        unique.add(key);
        return true;
      }) || [];
  const last = result.data?.pages.at(-1);
  const preferencesApplied = params.get(searchStateKey) === "preferences";
  const replaceSearch = (next: URLSearchParams) =>
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${next}${window.location.hash}`,
    );
  if (preferences.initializing)
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
        >
          <span>
            {ar ? "نجهّز البحث حسب تفضيلاتك" : "Preparing search with your preferences"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              replaceSearch(searchSnapshot(new URLSearchParams(serialized), {}, "manual"))
            }
          >
            {ar ? "المتابعة دون تفضيلات" : "Continue without preferences"}
          </Button>
        </div>
        <SearchSkeleton />
      </div>
    );
  const broaden = () => {
    const next = new URLSearchParams(serialized);
    [
      "neighborhoodId",
      "minPrice",
      "maxPrice",
      "minArea",
      "maxArea",
      "minBedrooms",
      "minBathrooms",
      "q",
      "furnished",
      "rentFrequency",
      "cursor",
      "locationDraft",
      "preferenceNotice",
    ].forEach((key) => next.delete(key));
    next.set("type", "all");
    next.set(searchStateKey, "manual");
    replaceSearch(next);
  };
  return (
      <div className="flex flex-col gap-7">
      <div className="flex min-w-0 flex-col gap-3">
        {preferences.userId ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={preferences.restoring}
              onClick={() => void preferences.restore()}
            >
              {preferences.restoring
                ? ar
                  ? "نحمّل تفضيلاتك"
                  : "Loading preferences"
                : ar
                  ? "استخدام تفضيلاتي"
                  : "Use my preferences"}
            </Button>
            {preferencesApplied ? (
              <p
                role="status"
                className="text-xs text-muted-foreground"
              >
                {ar
                  ? "طبّقنا تفضيلات سكنك. أي تعديل هنا ما يغيّر التفضيلات المحفوظة."
                  : "Your housing preferences are applied. Changes here will not update your saved preferences."}
              </p>
            ) : null}
          </div>
        ) : null}
        {preferences.feedback ? (
          <p
            role="status"
            className="text-xs text-muted-foreground"
          >
            {preferences.feedback === "none"
              ? ar
                ? "ما عندك تفضيلات محفوظة للحين. تقدر تبحث مباشرة."
                : "No saved preferences yet. You can search directly."
              : ar
                ? "ما قدرنا نحمّل تفضيلاتك الآن. تقدر تبحث يدويًا."
                : "Preferences could not be loaded. You can continue searching manually."}
          </p>
        ) : null}
        {preferencesApplied && params.has("preferenceNotice") ? (
          <p
            role="status"
            className="text-xs text-muted-foreground"
          >
            {ar
              ? "بعض التفضيلات ما انطبقت على المواقع المتاحة أو حدود البحث. راجع الفلاتر."
              : "Some preferences could not be matched to the location catalog or search limits. Review the selected filters."}
          </p>
        ) : null}
        <SearchForm
          key={serialized}
          initial={Object.fromEntries(params)}
          initialQuery={serialized}
          onInteraction={preferences.cancelRestore}
        />
      </div>
      <section
        aria-label={ar ? "نتائج البيوت" : "Home results"}
        className="flex min-w-0 flex-col gap-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <DisplayHeading
            as="h2"
            variant="section"
          >
            {ar ? "نتائج البحث" : "Search results"}
          </DisplayHeading>
          {properties.length ? (
            <p className="text-xs text-muted-foreground">
              {ar
                ? `بيوت معروضة: ${properties.length}`
                : `${properties.length} properties shown`}
            </p>
          ) : null}
        </div>
        {!params.get("city") ? (
          <EmptyState
            title={ar ? "اختر مدينة لبدء البحث" : "Choose a city to start"}
            description={
              ar
                ? "يمكنك البحث مباشرة أو استخدام تفضيلاتك المحفوظة إن وجدت."
                : "Search directly or use your saved preferences when available."
            }
          />
        ) : !parsed.success ? (
          <p
            role="alert"
            className="rounded-2xl border border-destructive p-5 text-destructive"
          >
            {parsed.message}
          </p>
        ) : location.pending ? (
          <div role="status">
            <span className="sr-only">{t("checkingLocations")}</span>
            <PropertyGridSkeleton
              appearance="image"
              count={6}
            />
          </div>
        ) : (location.cities.isError && !location.cities.data) ||
          (params.get("neighborhoodId") &&
            location.neighborhoods.isError &&
            !location.neighborhoods.data) ? (
          <p
            role="alert"
            className="rounded-2xl border border-destructive p-5 text-sm leading-7 text-destructive"
          >
            {t("catalogError")} {t("catalogErrorHelp")}
          </p>
        ) : !location.ready ? (
          <p
            role="alert"
            className="rounded-2xl border p-5 text-sm leading-7"
          >
            {t("invalidLocation")} {t("invalidLocationHelp")}
          </p>
        ) : locationDraft ? (
          <EmptyState
            title={t("draftTitle")}
            description={t("draftHelp")}
          />
        ) : result.isPending ? (
          <PropertyGridSkeleton
            appearance="image"
            count={6}
          />
        ) : (
          <>
            {result.isError ? (
              <ErrorState
                error={result.error}
                retry={() => {
                  if (!result.isFetching) void result.refetch();
                }}
                retryDisabled={result.isFetching}
              />
            ) : null}
            {result.isRefetching && !result.isFetchingNextPage ? (
              <p
                role="status"
                className="text-xs text-muted-foreground"
              >
                {ar ? "نحدّث نتائج البحث" : "Updating search results"}
              </p>
            ) : null}
            {!result.isError && !properties.length ? (
              <EmptyState
                title={ar ? "ما لقينا بيوت تطابق بحثك" : "No homes match your search"}
                description={
                  preferencesApplied
                    ? ar
                      ? "ما لقينا بيوت تطابق تفضيلاتك ضمن النتائج المتاحة. جرّب توسّع البحث."
                      : "No available homes matched your saved preferences. You can broaden the search."
                    : ar
                      ? "جرّب تعديل الميزانية أو نوع البيت أو الفلاتر الأخرى."
                      : "Try adjusting the budget, home type or other filters."
                }
              >
                <Button
                  variant="outline"
                  onClick={broaden}
                >
                  {ar ? "وسّع البحث" : "Broaden your search"}
                </Button>
              </EmptyState>
            ) : null}
            {properties.length ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {properties.map((property, index) => (
                    <PropertyCard
                        key={`${property.source}:${property.externalId || index}`}
                        property={property}
                        appearance="image"
                        onCompare={setCompareFirst}
                    />
                ))}
              </div>
            ) : null}
            {result.isFetchingNextPage ? (
              <PropertyGridSkeleton
                appearance="image"
                count={3}
              />
            ) : null}
            {result.hasNextPage ? (
              <Button
                size="lg"
                disabled={result.isFetching}
                onClick={() => {
                  if (!result.isFetching) void result.fetchNextPage();
                }}
              >
                {ar ? "تحميل المزيد" : "Load more"}
              </Button>
            ) : null}
            {last?.pagination.resultWindowReached ? (
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "وصلت إلى حد نافذة نتائج المزوّد. ضيّق نطاق البحث لرؤية خيارات أخرى."
                  : "The provider result limit was reached. Narrow the search for other options."}
              </p>
            ) : null}
            {last && !result.isError && !result.hasNextPage && properties.length ? (
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "هذه كل النتائج المتاحة لهذا البحث، وقد توجد إعلانات أخرى خارج النتائج."
                  : "These are all available results for this search. Other listings may exist."}
              </p>
            ) : null}
          </>
        )}
      </section>

      {compareFirst && (
          <CompareSearchDialog
              key={`${compareFirst.source}:${compareFirst.externalId}`}
              first={compareFirst}
              properties={properties}
              onClose={() => setCompareFirst(null)}
          />
      )}
    </div>
  );
}
