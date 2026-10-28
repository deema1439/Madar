
"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { HousePlus } from "lucide-react";

import type { SavedProperty } from "@/lib/api/contracts";
import type { Property } from "@/lib/api/discovery-contracts";
import { discovery } from "@/lib/api/discovery";
import { apiLanguage } from "@/lib/api/config";
import { savedPropertiesApi } from "@/lib/api/saved-properties";
import { homeApi } from "@/lib/api/current-home";

import { invalidateUserData } from "@/features/account/api/invalidation";
import { useIdentity } from "@/features/account/identity";
import {
    useHome,
    useHomeStatus,
} from "@/features/account/api/query-hooks";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";

import { SavedPropertyCard } from "./saved-property-card";

// Keep the existing concurrency limit for listing detail requests.
let activeDetails = 0;
const waitingDetails: (() => void)[] = [];

async function loadDetail<T>(
    signal: AbortSignal,
    load: () => Promise<T>,
): Promise<T> {
    if (activeDetails >= 2) {
        await new Promise<void>((resolve) =>
            waitingDetails.push(resolve),
        );
    } else {
        activeDetails++;
    }

    try {
        signal.throwIfAborted();
        return await load();
    } finally {
        const next = waitingDetails.shift();

        if (next) next();
        else activeDetails--;
    }
}

type PlannedProperty = {
    saved: SavedProperty;
    listing?: Property;
};

export function SavedPropertyGrid({
                                      properties,
                                      selectedIds,
                                      onToggleSelected,
                                      onRemoved,
                                  }: {
    properties: SavedProperty[];
    selectedIds: number[];
    onToggleSelected: (id: number) => void;
    onRemoved: (id: number) => void;
}) {
    const locale = useLocale();
    const language = apiLanguage(locale);
    const ar = locale === "ar";

    const { userId } = useIdentity();
    const cache = useQueryClient();
    const router = useRouter();

    const homeQuery = useHome(userId);
    const homeStatusQuery = useHomeStatus(userId);

    const container = useRef<HTMLDivElement>(null);

    const [approaching, setApproaching] = useState<Set<string>>(
        () => new Set(),
    );

    const [plannedProperty, setPlannedProperty] =
        useState<PlannedProperty | null>(null);

    const [planning, setPlanning] = useState(false);
    const [planError, setPlanError] = useState<unknown>(null);

    const currentHome = homeQuery.data;
    const currentHomeStatus = homeStatusQuery.data?.status;

    const references = JSON.stringify(
        properties.map((property) => [
            property.source,
            property.externalPropertyId,
        ]),
    );

    useEffect(() => {
        const cards =
            container.current?.querySelectorAll<HTMLElement>(
                "[data-listing-key]",
            );

        if (!cards) return;

        const reveal = (keys: string[]) =>
            setApproaching(
                (previous) => new Set([...previous, ...keys]),
            );

        if (!("IntersectionObserver" in window)) {
            const frame = requestAnimationFrame(() =>
                reveal(
                    Array.from(
                        cards,
                        (card) => card.dataset.listingKey!,
                    ),
                ),
            );

            return () => cancelAnimationFrame(frame);
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(
                    (entry) => entry.isIntersecting,
                );

                if (!visible.length) return;

                reveal(
                    visible.map(
                        (entry) =>
                            (entry.target as HTMLElement).dataset.listingKey!,
                    ),
                );

                visible.forEach((entry) =>
                    observer.unobserve(entry.target),
                );
            },
            { rootMargin: "200px" },
        );

        cards.forEach((card) => observer.observe(card));

        return () => observer.disconnect();
    }, [references]);

    const details = useQueries({
        queries: properties.map((property) => ({
            queryKey: [
                "property",
                property.source,
                property.externalPropertyId,
                language,
            ],

            queryFn: ({ signal }: { signal: AbortSignal }) =>
                loadDetail(signal, () =>
                    discovery.detail(
                        property.source,
                        property.externalPropertyId,
                        signal,
                        language,
                    ),
                ),

            enabled:
                !property.property &&
                property.available !== false &&
                approaching.has(
                    JSON.stringify([
                        property.source,
                        property.externalPropertyId,
                    ]),
                ) &&
                !!property.source &&
                !!property.externalPropertyId &&
                !["null", "undefined"].includes(
                    property.externalPropertyId,
                ),

            staleTime: 10 * 60 * 1000,
            retry: false,
        })),
    });

    const sameAsCurrentHome = (saved: SavedProperty) =>
        !!currentHome?.externalPropertyId &&
        currentHome.externalPropertyId ===
        saved.externalPropertyId &&
        currentHome.source?.toLowerCase() ===
        saved.source.toLowerCase();

    const confirmPlannedHome = async () => {
        if (!plannedProperty || planning) return;

        const { saved, listing } = plannedProperty;

        setPlanError(null);

        if (
            listing?.latitude == null ||
            listing.longitude == null ||
            !Number.isFinite(listing.latitude) ||
            !Number.isFinite(listing.longitude) ||
            listing.latitude < -90 ||
            listing.latitude > 90 ||
            listing.longitude < -180 ||
            listing.longitude > 180
        ) {
            setPlanError(
                new Error(
                    ar
                        ? "موقع هذا العقار غير متوفر أو غير صحيح. أضيفي منزلك يدويًا من صفحة منزلي وحيّي."
                        : "This listing has no valid location. Please add your home manually.",
                ),
            );
            return;
        }

        if (homeQuery.isPending || homeStatusQuery.isPending) {
            setPlanError(
                new Error(
                    ar
                        ? "انتظري حتى يكتمل تحميل بيانات منزلك."
                        : "Please wait until your home details finish loading.",
                ),
            );
            return;
        }

        if (homeQuery.isError || homeStatusQuery.isError) {
            setPlanError(
                new Error(
                    ar
                        ? "تعذّر التحقق من بيانات منزلك الحالي. حاولي مرة أخرى."
                        : "Could not verify your current home. Please retry.",
                ),
            );
            return;
        }

        if (currentHomeStatus === "MOVED_IN") {
            setPlanError(
                new Error(
                    ar
                        ? "منزلك الحالي مؤكّد السكن. لا يمكن بدء انتقال جديد قبل التأكد من آلية تغيير المنزل في النظام."
                        : "Your current home is confirmed. Starting a new move requires checking the backend home-change flow.",
                ),
            );
            return;
        }

        if (currentHome?.id) {
            setPlanError(
                new Error(
                    ar
                        ? "عندك منزل محدد مسبقًا. قبل استبداله، احذفي المنزل السابق من «منزلي وحيّي» حتى لا تبقى خطة انتقال مرتبطة به."
                        : "You already have a selected home. Remove it from My Home & Neighborhood before selecting another property.",
                ),
            );
            return;
        }

        setPlanning(true);

        try {
            await homeApi.add({
                latitude: listing.latitude,
                longitude: listing.longitude,
                externalPropertyId: saved.externalPropertyId,
                source: saved.source,
            });

            await invalidateUserData(cache, userId);

            await Promise.all([
                cache.invalidateQueries({
                    queryKey: ["current-home", userId],
                }),
                cache.invalidateQueries({
                    queryKey: ["home-status", userId],
                }),
                cache.invalidateQueries({
                    queryKey: ["moving-checklist", userId],
                }),
            ]);

            setPlannedProperty(null);
            router.push("/moving-checklist");
        } catch (error) {
            setPlanError(error);
        } finally {
            setPlanning(false);
        }
    };

    const selectedHasCoordinates =
        plannedProperty?.listing?.latitude != null &&
        plannedProperty?.listing?.longitude != null &&
        Number.isFinite(plannedProperty.listing.latitude) &&
        Number.isFinite(plannedProperty.listing.longitude);

    return (
        <>
            <div
                ref={container}
                className="@container/saved-grid min-w-0"
            >
                <div className="grid auto-rows-fr gap-4 @min-[44rem]/saved-grid:grid-cols-2">
                    {properties.map((property, index) => {
                        const query = details[index];

                        const valid =
                            !!property.source &&
                            !!property.externalPropertyId &&
                            !["null", "undefined"].includes(
                                property.externalPropertyId,
                            );

                        const listing =
                            property.property ?? query.data;

                        const selected =
                            property.id != null &&
                            selectedIds.includes(property.id);

                        const sameSelectionExists = selectedIds.some(
                            (id) =>
                                properties.some(
                                    (candidate) =>
                                        candidate.id === id &&
                                        candidate.source.toUpperCase() ===
                                        property.source.toUpperCase() &&
                                        candidate.externalPropertyId ===
                                        property.externalPropertyId,
                                ),
                        );

                        return (
                            <div
                                key={
                                    property.id ??
                                    `${property.source}:${property.externalPropertyId}`
                                }
                                data-listing-key={JSON.stringify([
                                    property.source,
                                    property.externalPropertyId,
                                ])}
                                className="min-w-0"
                            >
                                <SavedPropertyCard
                                    property={property}
                                    listing={listing}
                                    loading={
                                        query.isPending &&
                                        valid &&
                                        !property.property &&
                                        property.available !== false
                                    }
                                    detailsFailed={
                                        query.isError ||
                                        property.available === false ||
                                        !valid
                                    }
                                    refreshing={
                                        query.isFetching ||
                                        !valid ||
                                        property.available === false
                                    }
                                    onRetry={() => {
                                        if (
                                            valid &&
                                            property.available !== false
                                        ) {
                                            void query.refetch();
                                        }
                                    }}
                                    selected={selected}
                                    selectionDisabled={
                                        property.id == null ||
                                        property.available === false ||
                                        (!selected && selectedIds.length >= 2) ||
                                        (!selected && sameSelectionExists)
                                    }
                                    onToggleSelected={() => {
                                        if (property.id != null) {
                                            onToggleSelected(property.id);
                                        }
                                    }}
                                    onRemove={async () => {
                                        await savedPropertiesApi.remove(
                                            property.id!,
                                        );

                                        await invalidateUserData(
                                            cache,
                                            userId,
                                        );

                                        if (property.id != null) {
                                            onRemoved(property.id);
                                        }
                                    }}
                                    isPlannedHome={
                                        sameAsCurrentHome(property)
                                    }
                                    planningMove={planning}
                                    onPlanMove={() => {
                                        setPlanError(null);
                                        setPlannedProperty({
                                            saved: property,
                                            listing,
                                        });
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <AlertDialog
                open={plannedProperty !== null}
                onOpenChange={(open) => {
                    if (!open && !planning) {
                        setPlannedProperty(null);
                        setPlanError(null);
                    }
                }}
            >
                <AlertDialogContent
                    dir={ar ? "rtl" : "ltr"}
                    className="max-w-[calc(100vw-2rem)] sm:max-w-md"
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {ar
                                ? "تحديد منزل الانتقال"
                                : "Choose your moving home"}
                        </AlertDialogTitle>

                        <AlertDialogDescription>
                            {currentHomeStatus === "MOVED_IN"
                                ? ar
                                    ? "عندك منزل مؤكّد حاليًا. تغيير المنزل يحتاج إنهاء ارتباط المنزل السابق أولًا."
                                    : "You already have a confirmed home. Its existing associations must be handled before changing it."
                                : currentHome?.id
                                    ? ar
                                        ? "عندك منزل محدد مسبقًا. لحماية خطة الانتقال الحالية، احذفي المنزل السابق أولًا من صفحة منزلي وحيّي."
                                        : "You already have a selected home. Remove the previous one before choosing another."
                                    : ar
                                        ? "سيُسجّل هذا العقار كمنزلك المخطط للانتقال إليه. لن يتم تأكيد السكن الفعلي إلا عندما تؤكدين انتقالك."
                                        : "This property will be saved as your planned home. Moving in will only be confirmed when you explicitly confirm it."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {!selectedHasCoordinates ? (
                        <p className="rounded-xl bg-secondary/50 p-3 text-sm leading-7 text-muted-foreground">
                            {ar
                                ? "إحداثيات هذا الإعلان غير متوفرة. يمكنك إضافة منزلك يدويًا وتحديد موقعه من صفحة منزلي وحيّي."
                                : "This listing has no location coordinates. You can add your home manually from My Home & Neighborhood."}
                        </p>
                    ) : null}

                    {planError ? (
                        <ErrorState error={planError} />
                    ) : null}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={planning}>
                            {ar ? "إلغاء" : "Cancel"}
                        </AlertDialogCancel>

                        {currentHome?.id || !selectedHasCoordinates ? (
                            <Button
                                nativeButton={false}
                                render={
                                    <a
                                        href={`/${locale}/neighborhood`}
                                    />
                                }
                                variant="outline"
                                disabled={planning}
                            >
                                {ar
                                    ? "الانتقال إلى منزلي وحيّي"
                                    : "Go to My Home"}
                            </Button>
                        ) : (
                            <Button
                                disabled={
                                    planning ||
                                    homeQuery.isPending ||
                                    homeStatusQuery.isPending
                                }
                                onClick={() =>
                                    void confirmPlannedHome()
                                }
                            >
                                <HousePlus className="size-4 shrink-0" />
                                {planning
                                    ? ar
                                        ? "جارٍ الحفظ..."
                                        : "Saving..."
                                    : ar
                                        ? "تحديد المنزل"
                                        : "Select home"}
                            </Button>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
