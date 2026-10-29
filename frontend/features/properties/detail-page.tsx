
"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ArrowLeftRight, HousePlus } from "lucide-react";

import { DisplayHeading } from "@/components/typography/display-heading";
import { apiLanguage } from "@/lib/api/config";
import { discovery } from "@/lib/api/discovery";
import { ErrorState } from "@/components/shared/error-state";
import { DetailSkeleton, PropertyGridSkeleton } from "./skeletons";
import { QueryFeedback } from "@/components/shared/query-feedback";
import { PropertyCard } from "./property-card";
import { PropertyGallery } from "./components/property-gallery";
import { PropertyInfoCard } from "./components/property-info-card";
import { PropertyLocationExperience } from "@/features/properties/components/property-location-experience";
import { Button } from "@/components/ui/button";
import { PropertyBackButton } from "./components/property-back-button";
import { CompareWithSavedHome } from "./compare-with-saved-home";
import { useProperty } from "./use-property";

export function PropertyDetailPage({
                                       source,
                                       externalId,
                                   }: {
    source: string;
    externalId: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-8">
            <PropertyBackButton key={`${source}:${externalId}`} />

            <PropertyDetailContent
                source={source}
                externalId={externalId}
            />
        </div>
    );
}

function PropertyDetailContent({
                                   source,
                                   externalId,
                               }: {
    source: string;
    externalId: string;
}) {
    const locale = useLocale();
    const ar = locale === "ar";
    const language = apiLanguage(locale);

    const query = useProperty(source, externalId);
    const [showSimilar, setShowSimilar] = useState(false);

    const similar = useQuery({
        queryKey: ["similar", source, externalId, language],
        queryFn: ({ signal }) =>
            discovery.similar(source, externalId, signal, language),
        enabled: showSimilar && query.isSuccess,
        retry: false,
    });

    if (!source || !externalId || ["null", "undefined"].includes(externalId)) {
        return (
            <p>
                معرّف الإعلان غير متاح؛ يبقى المرجع المحفوظ قابلًا للإدارة.
            </p>
        );
    }

    if (query.isPending) return <DetailSkeleton />;

    if (query.isError && !query.data) {
        return (
            <ErrorState
                error={query.error}
                retry={() => void query.refetch()}
                retryDisabled={query.isFetching}
            />
        );
    }

    const p = query.data;
    const title = p.title || "تفاصيل البيت";

    return (
        <div className="flex min-w-0 flex-col gap-8 pb-10 lg:gap-12">
            <QueryFeedback query={query} />

            {/* SECTION 1 — Property overview */}
            <section className="space-y-7">
                <header className="flex min-w-0 flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                        تفاصيل الإعلان ·{" "}
                        <bdi>{p.sourceName || p.source}</bdi>
                    </p>

                    <DisplayHeading
                        dir="auto"
                        className="text-start"
                    >
                        {title}
                    </DisplayHeading>

                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin
                            aria-hidden="true"
                            className="size-4 shrink-0"
                        />
                        <bdi>
                            {[p.cityName || p.city, p.neighborhood]
                                .filter(Boolean)
                                .join(" · ") || "الموقع غير متاح من المصدر"}
                        </bdi>
                    </p>
                </header>

                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-7">
                    <div className="order-2 min-w-0 lg:order-1">
                        <PropertyInfoCard property={p} />
                    </div>

                    <div className="order-1 min-w-0 lg:order-2">
                        <PropertyGallery
                            key={`${source}:${externalId}`}
                            title={title}
                            images={[p.image, ...(p.images || [])]}
                        />
                    </div>
                </div>
            </section>

            {/* SECTION 2 — Comparison */}
            <section className="border-t border-border/60 pt-7 lg:pt-9">
                <CompareWithSavedHome
                    source={source}
                    externalId={externalId}
                />
            </section>

            {/* SECTION 3 — Location and neighborhood */}
            <section className="border-t border-border/60 pt-7 lg:pt-9">
                <PropertyLocationExperience
                    key={`${source}:${externalId}`}
                    propertyReference={{ source, externalId }}
                    point={{
                        id: `${source}:${externalId}`,
                        title,
                        latitude: p.latitude,
                        longitude: p.longitude,
                        provenance: "listing",
                        kind: "home",
                    }}
                />
            </section>

            {/* SECTION 4 — Similar properties */}

            {/* SECTION 4 — Similar properties */}
            <section className="border-t border-border/60 pt-8 lg:pt-10">
                <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <HousePlus className="size-4" aria-hidden="true" />
                            <span>
          {ar ? "اكتشف خيارات أكثر" : "Explore more homes"}
        </span>
                        </div>

                        <h2 className="text-2xl font-semibold tracking-tight">
                            {ar
                                ? "بيوت قد تناسبك أيضًا"
                                : "Homes you might also like"}
                        </h2>

                        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                            {ar
                                ? "اكتشف عقارات مشابهة لهذا البيت من حيث السعر والمساحة والموقع."
                                : "Discover similar homes based on price, size, and location."}
                        </p>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-fit shrink-0 rounded-xl"
                        aria-expanded={showSimilar}
                        onClick={() => setShowSimilar((v) => !v)}
                    >
                        <ArrowLeftRight className="size-4" aria-hidden="true" />
                        {showSimilar
                            ? ar
                                ? "إخفاء العقارات"
                                : "Hide homes"
                            : ar
                                ? "استعراض العقارات"
                                : "Browse homes"}
                    </Button>
                </div>

                {showSimilar ? (
                    <div className="space-y-5">
                        <QueryFeedback query={similar} />

                        {similar.isPending ? (
                            <PropertyGridSkeleton count={3} />
                        ) : similar.isError && !similar.data?.length ? (
                            <ErrorState
                                error={similar.error}
                                retry={() => void similar.refetch()}
                                retryDisabled={similar.isFetching}
                            />
                        ) : similar.data?.length ? (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {similar.data.map((item, i) => (
                                    <PropertyCard
                                        key={`${item.source}:${item.externalId || i}`}
                                        property={item}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
                                {ar
                                    ? "ما لقينا عقارات مشابهة متاحة حاليًا."
                                    : "No similar homes are currently available."}
                            </p>
                        )}
                    </div>
                ) : null}
            </section>

        </div>
    );
}
