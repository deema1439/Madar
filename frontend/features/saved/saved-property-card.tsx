
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
    ArrowUpRight,
    BookmarkCheck,
    Check,
    HousePlus,
    MoreHorizontal,
    RefreshCw,
    Scale,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type { SavedProperty } from "@/lib/api/contracts";
import type { Property } from "@/lib/api/discovery-contracts";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PropertyCardView } from "@/features/properties/property-card-view";
import { propertyCardData } from "@/lib/property-card";
import { propertyHref } from "@/features/properties/format";
import { ErrorState } from "@/components/shared/error-state";

const typeLabels: Record<string, { ar: string; en: string }> = {
    apartment: { ar: "شقة", en: "Apartment" },
    villa: { ar: "فيلا", en: "Villa" },
    floor: { ar: "دور", en: "Floor" },
    duplex: { ar: "دوبلكس", en: "Duplex" },
    building: { ar: "عمارة", en: "Building" },
};

export function SavedPropertyCard({
                                      property,
                                      listing,
                                      loading,
                                      detailsFailed,
                                      refreshing,
                                      onRetry,
                                      onRemove,
                                      selected,
                                      selectionDisabled,
                                      onToggleSelected,
                                      onPlanMove,
                                      planningMove,
                                      isPlannedHome,
                                  }: {
    property: SavedProperty;
    listing?: Property;
    loading: boolean;
    detailsFailed: boolean;
    refreshing: boolean;
    onRetry: () => void;
    onRemove: () => Promise<unknown>;
    selected: boolean;
    selectionDisabled: boolean;
    onToggleSelected: () => void;
    onPlanMove: () => void;
    planningMove: boolean;
    isPlannedHome: boolean;
}) {
    const locale = useLocale();
    const ar = locale === "ar";
    const t = useTranslations("Workspace");

    const actionsTrigger = useRef<HTMLButtonElement>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState<unknown>();

    const localizedListing = listing
        ? {
            ...listing,
            title: ar
                ? listing.titleAr || listing.title
                : listing.titleEn || listing.title,
            cityName: ar
                ? listing.cityNameAr || listing.cityName
                : listing.cityNameEn || listing.cityName,
            neighborhood: ar
                ? listing.neighborhoodAr || listing.neighborhood
                : listing.neighborhoodNameEn || listing.neighborhood,
        }
        : undefined;

    const title =
        localizedListing?.title?.trim() ||
        (ar ? property.titleSnapshotAr : property.titleSnapshotEn)?.trim() ||
        property.titleSnapshot?.trim() ||
        t("untitledProperty");

    const validReference =
        !!property.source &&
        !!property.externalPropertyId &&
        !["null", "undefined"].includes(property.externalPropertyId);

    const href = validReference
        ? propertyHref({
            source: property.source,
            externalId: property.externalPropertyId,
        })
        : undefined;

    const model = propertyCardData(localizedListing, title);
    const type = localizedListing?.propertyType?.trim().toLowerCase();

    return (
        <>
            <PropertyCardView
                variant="compact"
                listing={model}
                href={href}
                loading={loading && !listing}
                className={
                    selected ? "border-primary ring-1 ring-primary/25" : undefined
                }
                badge={
                    type ? (
                        <Badge variant="secondary">
                            {typeLabels[type]?.[ar ? "ar" : "en"] ||
                                localizedListing?.propertyType}
                        </Badge>
                    ) : undefined
                }
                imageFallback={
                    <div className="absolute inset-0">
                        <Image
                            src="/hero.png"
                            alt=""
                            fill
                            sizes="(max-width: 768px) 100vw, 40vw"
                            className="object-cover object-center"
                        />
                        <span className="absolute bottom-2 start-2 rounded-full bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
              {t("illustrativeImage")}
            </span>
                    </div>
                }
                overlayStartActions={
                    <Button
                        type="button"
                        size="icon"
                        variant={selected ? "default" : "secondary"}
                        className="size-11 rounded-full shadow-sm"
                        aria-label={t(
                            selected ? "removeFromComparison" : "selectForComparison",
                            { title },
                        )}
                        aria-pressed={selected}
                        disabled={selectionDisabled}
                        onClick={onToggleSelected}
                    >
                        {selected ? <Check /> : <Scale />}
                    </Button>
                }
                overlayActions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="size-11 rounded-full shadow-sm"
                            aria-label={t("removeSavedProperty", { title })}
                            onClick={() => {
                                setRemoveError(undefined);
                                setRemoveOpen(true);
                            }}
                        >
                            <BookmarkCheck />
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        ref={actionsTrigger}
                                        size="icon"
                                        variant="secondary"
                                        className="size-11 rounded-full shadow-sm"
                                    />
                                }
                                aria-label={
                                    ar ? `خيارات ${title}` : `Actions for ${title}`
                                }
                            >
                                <MoreHorizontal />
                            </DropdownMenuTrigger>

                            <DropdownMenuContent
                                align="end"
                                className="w-64 max-w-[calc(100vw-2rem)] motion-reduce:animate-none"
                            >
                                <DropdownMenuGroup>
                                    <DropdownMenuLabel className="truncate">
                                        {title}
                                    </DropdownMenuLabel>

                                    <DropdownMenuItem
                                        className="min-h-11"
                                        disabled={refreshing}
                                        onClick={onRetry}
                                    >
                                        <RefreshCw />
                                        {ar ? "تحديث بيانات البيت" : "Refresh listing"}
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>

                                <dl className="flex flex-col gap-1 border-t border-border/50 px-2 py-3 text-xs text-muted-foreground">
                                    <div className="flex gap-2">
                                        <dt>{ar ? "المصدر" : "Source"}</dt>
                                        <dd className="min-w-0 break-all">
                                            <bdi>{property.source}</bdi>
                                        </dd>
                                    </div>

                                    <div className="flex gap-2">
                                        <dt>{ar ? "المرجع" : "Reference"}</dt>
                                        <dd className="min-w-0 break-all">
                                            <bdi>{property.externalPropertyId}</bdi>
                                        </dd>
                                    </div>

                                    {property.savedAt &&
                                    !Number.isNaN(Date.parse(property.savedAt)) ? (
                                        <div>
                                            <dt className="sr-only">
                                                {ar ? "تاريخ الحفظ" : "Saved on"}
                                            </dt>
                                            <dd>
                                                {new Intl.DateTimeFormat(locale, {
                                                    dateStyle: "medium",
                                                }).format(new Date(property.savedAt))}
                                            </dd>
                                        </div>
                                    ) : null}
                                </dl>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                }
                status={
                    detailsFailed ? (
                        <div
                            role="status"
                            className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground"
                        >
              <span>
                {property.available === false
                    ? t("listingUnavailable")
                    : ar
                        ? "تعذّر تحديث تفاصيل الإعلان."
                        : "Listing details could not be refreshed."}
              </span>

                            {property.available === false ? null : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={refreshing}
                                    onClick={onRetry}
                                >
                                    {ar ? "إعادة المحاولة" : "Retry"}
                                </Button>
                            )}
                        </div>
                    ) : null
                }
                footer={
                    <div className="flex w-full flex-col gap-2">
                        {isPlannedHome ? (
                            <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                                <Check className="size-4 shrink-0" />
                                <span>
                  {ar
                      ? "هذا منزلك المحدد"
                      : "Your selected home"}
                </span>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                className="w-full justify-center gap-2"
                                disabled={
                                    planningMove ||
                                    !validReference ||
                                    property.available === false
                                }
                                onClick={onPlanMove}
                            >
                                <HousePlus className="size-4 shrink-0" />
                                <span>
                  {planningMove
                      ? ar
                          ? "جارٍ تحديد المنزل..."
                          : "Setting home..."
                      : ar
                          ? "أخطط للانتقال لهذا البيت"
                          : "Plan to move here"}
                </span>
                            </Button>
                        )}

                        {href ? (
                            <Button
                                nativeButton={false}
                                render={<Link href={href} />}
                                variant="outline"
                                className="w-full justify-between"
                            >
                                {ar ? "عرض البيت" : "View home"}
                                <ArrowUpRight
                                    data-icon="inline-end"
                                    className="rtl:-scale-x-100"
                                />
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {t("listingReferenceUnavailable")}
                            </p>
                        )}
                    </div>
                }
            />

            <AlertDialog
                open={removeOpen}
                onOpenChange={(value) => {
                    if (!removing) setRemoveOpen(value);
                }}
            >
                <AlertDialogContent
                    finalFocus={actionsTrigger}
                    dir={ar ? "rtl" : "ltr"}
                    className="max-w-[calc(100vw-2rem)] sm:max-w-md"
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("confirmDelete")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {ar
                                ? `إزالة «${title}» من قائمتك المحفوظة؟`
                                : `Remove “${title}” from your saved properties?`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {removeError ? <ErrorState error={removeError} /> : null}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removing}>
                            {t("cancel")}
                        </AlertDialogCancel>

                        <Button
                            variant="destructive"
                            disabled={removing}
                            aria-busy={removing}
                            onClick={async () => {
                                setRemoving(true);
                                setRemoveError(undefined);

                                try {
                                    await onRemove();
                                    setRemoveOpen(false);
                                } catch (error) {
                                    setRemoveError(error);
                                } finally {
                                    setRemoving(false);
                                }
                            }}
                        >
                            {removing ? t("working") : t("remove")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
