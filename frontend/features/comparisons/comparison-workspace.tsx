"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeftRight, MapPin, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { Link, useRouter } from "@/i18n/navigation";
import { useIdentity } from "@/features/account/identity";
import { useSaved } from "@/features/account/api/query-hooks";
import { PropertyFacts } from "@/features/properties/property-facts";
import { PropertyMedia } from "@/features/properties/property-media";
import { propertyHref } from "@/features/properties/format";
import { discovery } from "@/lib/api/discovery";
import { apiLanguage } from "@/lib/api/config";
import type { Property } from "@/lib/api/discovery-contracts";
import type { PropertyComparison, SavedProperty } from "@/lib/api/contracts";
import { ComparisonLocationAnalysis } from "./comparison-location-analysis";

type Ref = { source: string; id: string; saved?: SavedProperty };

function refForProperty(property?: SavedProperty): Ref | null {
  return property
    ? { source: property.source, id: property.externalPropertyId, saved: property }
    : null;
}

function amount(value: number | string | null | undefined, locale: string, suffix = "") {
  if (typeof value === "string") return value || null;
  return value == null || !Number.isFinite(value)
    ? null
    : `${new Intl.NumberFormat(locale).format(value)}${suffix ? ` ${suffix}` : ""}`;
}

function labels(locale: string, value: string | null | undefined) {
  if (!value) return null;
  const lookup: Record<string, [string, string]> = {
    apartment: ["شقة", "Apartment"],
    villa: ["فيلا", "Villa"],
    floor: ["دور", "Floor"],
    duplex: ["دوبلكس", "Duplex"],
    building: ["عمارة", "Building"],
    office: ["مكتب", "Office"],
    shop: ["محل", "Shop"],
    warehouse: ["مستودع", "Warehouse"],
    land: ["أرض", "Land"],
    rent: ["للإيجار", "For rent"],
    sale: ["للبيع", "For sale"],
  };
  return lookup[value.toLowerCase()]?.[locale === "ar" ? 0 : 1] ?? value;
}

function ListingCard({
  property,
  listing,
  reference,
  loading,
  onRemove,
}: {
  property?: SavedProperty;
  listing?: Property;
  reference?: Ref | null;
  loading: boolean;
  onRemove: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Workspace");
  const ar = locale === "ar";
  const title =
    (ar ? listing?.titleAr || listing?.title : listing?.titleEn || listing?.title) ||
    (ar ? property?.titleSnapshotAr : property?.titleSnapshotEn) ||
    property?.titleSnapshot ||
    reference?.id ||
    t("untitledProperty");
  const location = [
    ar
      ? listing?.cityNameAr || listing?.cityName || listing?.city
      : listing?.cityNameEn || listing?.cityName || listing?.city,
    ar
      ? listing?.neighborhoodAr || listing?.neighborhood
      : listing?.neighborhoodNameEn || listing?.neighborhood,
  ]
    .filter(Boolean)
    .join(" · ");
  const href = listing?.externalId
    ? propertyHref(listing)
    : reference
      ? propertyHref({ source: reference.source, externalId: reference.id })
      : undefined;

  if (!reference && !property) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 p-6 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">
          <Plus aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm text-muted-foreground">{t("comparisonChooseSlot")}</p>
      </div>
    );
  }
  return (
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-panel">
      <div className="relative aspect-video bg-secondary">
        {loading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : (
          <PropertyMedia
            src={listing?.image ?? null}
            title={title}
            aspect="fill"
            sizes="(max-width: 768px) 100vw, 45vw"
          />
        )}
        {reference ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute end-3 top-3 size-9 rounded-full shadow-sm"
            aria-label={t("removeComparisonProperty", { title })}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-48 flex-col gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h3
            className="line-clamp-2 font-semibold"
            dir="auto"
          >
            {title}
          </h3>
          <p
            className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground"
            dir="auto"
          >
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {location || t("locationUnavailable")}
          </p>
        </div>
        <p className="text-lg font-bold text-primary tabular-nums">
          {listing?.price == null
            ? t("priceUnavailable")
            : `${amount(listing.price, locale)} ${ar ? "ر.س" : "SAR"}${listing.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""}`}
        </p>
        <PropertyFacts
          property={listing ?? { bedrooms: null, bathrooms: null, areaSqm: null }}
          locale={locale}
          hideEmpty
        />
        {href ? (
          <Button
            nativeButton={false}
            render={<Link href={href} />}
            variant="outline"
            className="mt-auto w-full"
          >
            {t("viewProperty")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CompareRow({
  title,
  first,
  second,
  prefer,
  firstMetric,
  secondMetric,
}: {
  title: string;
  first: string | null;
  second: string | null;
  prefer?: "lower" | "higher";
  firstMetric?: number | null;
  secondMetric?: number | null;
}) {
  const t = useTranslations("Workspace");
  const better =
    prefer && firstMetric != null && secondMetric != null && firstMetric !== secondMetric
      ? prefer === "lower"
        ? firstMetric < secondMetric
          ? 1
          : 2
        : firstMetric > secondMetric
          ? 1
          : 2
      : null;
  return (
    <div className="grid grid-cols-[minmax(6rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-t border-border/60 px-4 py-3 first:border-0 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:px-5">
      <p className="text-xs text-muted-foreground sm:text-sm">{title}</p>
      {[first, second].map((value, index) => (
        <p
          key={index}
          className={`min-w-0 break-words text-sm font-medium tabular-nums ${better === index + 1 ? "text-primary" : ""}`}
        >
          {value ?? t("comparisonUnavailable")}
        </p>
      ))}
    </div>
  );
}

function DetailSection({
  title,
  rows,
}: {
  title: string;
  rows: {
    label: string;
    first: string | null;
    second: string | null;
    prefer?: "lower" | "higher";
    firstMetric?: number | null;
    secondMetric?: number | null;
  }[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-panel">
      <h2 className="px-4 py-4 text-base font-semibold sm:px-5">{title}</h2>
      {rows.map((row) => (
        <CompareRow
          key={row.label}
          title={row.label}
          first={row.first}
          second={row.second}
          prefer={row.prefer}
          firstMetric={row.firstMetric}
          secondMetric={row.secondMetric}
        />
      ))}
    </section>
  );
}

export function ComparisonWorkspace({
  initialPair,
}: {
  initialPair?: PropertyComparison;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const t = useTranslations("Workspace");
  const router = useRouter();
  const params = useSearchParams();
  const { userId } = useIdentity();
  const saved = useSaved(userId);
  const properties = saved.data ?? [];
  const pairFirst =
    initialPair &&
    properties.find(
      (item) =>
        item.source.toUpperCase() === initialPair.firstPropertySource.toUpperCase() &&
        item.externalPropertyId === initialPair.firstPropertyId,
    );
  const pairSecond =
    initialPair &&
    properties.find(
      (item) =>
        item.source.toUpperCase() === initialPair.secondPropertySource.toUpperCase() &&
        item.externalPropertyId === initialPair.secondPropertyId,
    );
  const [selection, setSelection] = useState({ first: "", second: "", changed: false });
  const firstId = selection.changed
    ? selection.first
    : params.get("first") || (pairFirst?.id == null ? "" : String(pairFirst.id));
  const secondId = selection.changed
    ? selection.second
    : params.get("second") || (pairSecond?.id == null ? "" : String(pairSecond.id));
  const showPairFallback = !selection.changed;
  const firstSaved = properties.find((item) => String(item.id) === firstId);
  const secondSaved = properties.find((item) => String(item.id) === secondId);
  const refs: (Ref | null)[] = [
    refForProperty(firstSaved) ??
      (showPairFallback && initialPair
        ? { source: initialPair.firstPropertySource, id: initialPair.firstPropertyId }
        : null),
    refForProperty(secondSaved) ??
      (showPairFallback && initialPair
        ? { source: initialPair.secondPropertySource, id: initialPair.secondPropertyId }
        : null),
  ];
  const language = apiLanguage(locale);
  const details = useQueries({
    queries: refs.map((reference) => ({
      queryKey: ["property", reference?.source, reference?.id, language],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        discovery.detail(reference!.source, reference!.id, signal, language),
      enabled:
        !!reference &&
        !reference.saved?.property &&
        !!reference.id &&
        !["null", "undefined"].includes(reference.id),
      retry: false,
      staleTime: 10 * 60 * 1000,
    })),
  });
  const listings = refs.map(
    (reference, index) => reference?.saved?.property ?? details[index].data,
  );
  const selectedIds = [firstId, secondId].filter(Boolean);
  const selectionValid = !!firstId && !!secondId && firstId !== secondId;

  function changeSelection(first: string, second: string) {
    setSelection({ first, second, changed: true });
    const query = new URLSearchParams();
    if (first) query.set("first", first);
    if (second) query.set("second", second);
    router.replace(`/compare${query.size ? `?${query}` : ""}`, { scroll: false });
  }

  const listing = (index: number) => listings[index] as Property | undefined;
  const first = listing(0);
  const second = listing(1);
  const currency = ar ? "ر.س" : "SAR";
  const samePriceBasis =
    !!first &&
    !!second &&
    first.listingType === second.listingType &&
    first.pricePeriod === second.pricePeriod;
  const value = (
    property: Property | undefined,
    field: "price" | "areaSqm" | "bedrooms" | "bathrooms",
  ) => property?.[field];
  const detailsRows = [
    {
      label: t("comparisonMetric.price"),
      a: value(first, "price"),
      b: value(second, "price"),
      unit: `${currency}${first?.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""}`,
      secondUnit: `${currency}${second?.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""}`,
      prefer: samePriceBasis ? ("lower" as const) : undefined,
    },
    {
      label: t("comparisonMetric.area"),
      a: value(first, "areaSqm"),
      b: value(second, "areaSqm"),
      unit: ar ? "م²" : "m²",
      prefer: "higher" as const,
    },
    {
      label: t("comparisonMetric.pricePerArea"),
      a:
        first?.price != null && first.areaSqm && first.areaSqm > 0
          ? first.price / first.areaSqm
          : null,
      b:
        second?.price != null && second.areaSqm && second.areaSqm > 0
          ? second.price / second.areaSqm
          : null,
      unit: `${currency}${first?.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""} / ${ar ? "م²" : "m²"}`,
      secondUnit: `${currency}${second?.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""} / ${ar ? "م²" : "m²"}`,
      prefer: samePriceBasis ? ("lower" as const) : undefined,
    },
    {
      label: t("comparisonMetric.bedrooms"),
      a: value(first, "bedrooms"),
      b: value(second, "bedrooms"),
      unit: "",
      prefer: "higher" as const,
    },
    {
      label: t("comparisonMetric.bathrooms"),
      a: value(first, "bathrooms"),
      b: value(second, "bathrooms"),
      unit: "",
      prefer: "higher" as const,
    },
    {
      label: t("comparisonMetric.propertyType"),
      a: labels(locale, first?.propertyType),
      b: labels(locale, second?.propertyType),
    },
    {
      label: t("comparisonMetric.listingType"),
      a: labels(locale, first?.listingType),
      b: labels(locale, second?.listingType),
    },
  ];
  const locationRows = [
    {
      label: t("comparisonMetric.city"),
      a: ar
        ? first?.cityNameAr || first?.cityName || first?.city
        : first?.cityNameEn || first?.cityName || first?.city,
      b: ar
        ? second?.cityNameAr || second?.cityName || second?.city
        : second?.cityNameEn || second?.cityName || second?.city,
    },
    {
      label: t("comparisonMetric.neighborhood"),
      a: ar
        ? first?.neighborhoodAr || first?.neighborhood
        : first?.neighborhoodNameEn || first?.neighborhood,
      b: ar
        ? second?.neighborhoodAr || second?.neighborhood
        : second?.neighborhoodNameEn || second?.neighborhood,
    },
  ];
  const summary: string[] = [];
  const firstTitle =
    first?.title || firstSaved?.titleSnapshot || refs[0]?.id || t("untitledProperty");
  const secondTitle =
    second?.title || secondSaved?.titleSnapshot || refs[1]?.id || t("untitledProperty");
  if (
    samePriceBasis &&
    first?.price != null &&
    second?.price != null &&
    first.price !== second.price
  ) {
    const cheaper = first.price < second.price ? firstTitle : secondTitle;
    summary.push(
      t("comparisonPriceDifference", {
        property: cheaper,
        difference:
          amount(
            Math.abs(first.price - second.price),
            locale,
            `${currency}${first.pricePeriod === "yearly" ? ` / ${t("pricePeriodYear")}` : ""}`,
          ) ?? "—",
      }),
    );
  }
  if (
    first?.areaSqm != null &&
    second?.areaSqm != null &&
    first.areaSqm !== second.areaSqm
  ) {
    const larger = first.areaSqm > second.areaSqm ? firstTitle : secondTitle;
    summary.push(
      t("comparisonAreaDifference", {
        property: larger,
        difference:
          amount(Math.abs(first.areaSqm - second.areaSqm), locale, ar ? "م²" : "m²") ??
          "—",
      }),
    );
  }

  if (saved.isPending)
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  if (saved.isError && !saved.data)
    return (
      <ErrorState
        error={saved.error}
        retry={() => void saved.refetch()}
      />
    );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page font-medium tracking-tight">
            {t("comparisonsTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("comparisonWorkspaceDescription")}
          </p>
          <p className="mt-2 text-sm font-medium text-primary">
            {t("comparisonSelectedCount", { count: selectedIds.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {initialPair ? (
            <Button
              nativeButton={false}
              render={<Link href="/compare" />}
              variant="outline"
            >
              {t("allComparisons")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              document
                .getElementById("comparison-property-picker")
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            <ArrowLeftRight aria-hidden="true" />
            {t("changeComparisonProperties")}
          </Button>
          {selectedIds.length ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => changeSelection("", "")}
            >
              {t("clearComparisonSelection")}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        id="comparison-property-picker"
        className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-panel md:grid-cols-2 sm:p-5"
      >
        {[0, 1].map((index) => (
          <div
            key={index}
            className="min-w-0"
          >
            <label className="mb-2 block text-sm font-medium">
              {t(index === 0 ? "fields.first" : "fields.second")}
            </label>
            <Select
              value={index === 0 ? firstId : secondId}
              onValueChange={(value) =>
                value &&
                changeSelection(
                  index === 0 ? value : firstId,
                  index === 1 ? value : secondId,
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("comparisonChooseSlot")} />
              </SelectTrigger>
              <SelectContent>
                {properties
                  .filter(
                    (item) =>
                      item.id != null &&
                      (index === 0
                        ? String(item.id) !== secondId
                        : String(item.id) !== firstId),
                  )
                  .map((item) => (
                    <SelectItem
                      key={item.id}
                      value={String(item.id)}
                    >
                      {item.titleSnapshot ||
                        item.property?.title ||
                        item.externalPropertyId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </section>

      {!selectionValid ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
          {properties.length < 2
            ? t("needTwoPropertiesHint")
            : t("selectTwoComparisonProperties")}
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-4 text-lg font-semibold">{t("comparisonOverview")}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((index) => (
                <ListingCard
                  key={`${refs[index]?.source}:${refs[index]?.id}`}
                  property={index === 0 ? firstSaved : secondSaved}
                  reference={refs[index]}
                  listing={listing(index)}
                  loading={details[index].isPending}
                  onRemove={() =>
                    changeSelection(
                      index === 0 ? "" : firstId,
                      index === 1 ? "" : secondId,
                    )
                  }
                />
              ))}
            </div>
          </section>
          {details.some((query) => query.isError) ? (
            <ErrorState
              error={details.find((query) => query.isError)?.error}
              retry={() =>
                details.forEach((query) => {
                  if (query.isError) void query.refetch();
                })
              }
            />
          ) : null}
          <DetailSection
            title={t("comparisonPropertyDetails")}
            rows={detailsRows.map((row) => ({
              label: row.label,
              first:
                amount(row.a, locale, row.unit) ??
                (typeof row.a === "string" ? row.a : null),
              second:
                amount(row.b, locale, row.secondUnit ?? row.unit) ??
                (typeof row.b === "string" ? row.b : null),
              prefer: row.prefer,
              firstMetric: typeof row.a === "number" ? row.a : null,
              secondMetric: typeof row.b === "number" ? row.b : null,
            }))}
          />
          <DetailSection
            title={t("comparisonLocation")}
            rows={locationRows.map((row) => ({
              label: row.label,
              first: row.a ?? null,
              second: row.b ?? null,
            }))}
          />
          {summary.length ? (
            <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
              <h2 className="font-semibold">{t("comparisonSummary")}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
                {summary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <ComparisonLocationAnalysis
            properties={[firstSaved, secondSaved]
              .filter((item): item is SavedProperty => !!item)
              .map((item, index) => ({
                ...item,
                property: listing(index) ?? item.property,
              }))}
          />

        </>
      )}
    </div>
  );
}
