
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ArrowUpLeft,
    CheckCircle2,
    House,
    LocateFixed,
    MapPin,
    Pencil,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { QueryFeedback } from "@/components/shared/query-feedback";
import { SummaryPanelSkeleton } from "@/components/shared/page-skeleton";
import { TaskDialog } from "@/components/shared/task-dialog";
import { Button } from "@/components/ui/button";
import { MadarMap } from "@/components/maps/madar-map";
import { neighborhood } from "@/lib/api/neighborhood";
import {
    currentHomeSchema,
    type CurrentHome,
} from "@/lib/api/contracts";
import { homeApi } from "@/lib/api/current-home";
import { invalidateUserData } from "@/features/account/api/invalidation";
import {
    useHome,
    useHomeStatus,
    usePlaces,
} from "@/features/account/api/query-hooks";
import { useIdentity } from "@/features/account/identity";
import {
    DataForm,
    type FormField,
} from "@/components/forms/data-form";
import { DeleteAction } from "@/components/shared/delete-action";
import { ErrorState } from "@/components/shared/error-state";
import { CoordinateField } from "./location-fields";
import { getProductCopy } from "@/messages/product-copy";

function ConfirmMove({ userId }: { userId: number }) {
    const locale = useLocale();
    const ar = locale === "ar";
    const copy = getProductCopy(locale);
    const cache = useQueryClient();

    const mutation = useMutation({
        mutationFn: () => neighborhood.confirm(),
        onSuccess: async () => {
            await Promise.allSettled([
                invalidateUserData(cache, userId),
                cache.invalidateQueries({
                    queryKey: ["home-status", userId],
                }),
                cache.invalidateQueries({
                    queryKey: ["moving-checklist", userId],
                }),
            ]);
        },
    });

    return (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" />
        </span>

                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">
                        {ar ? "هل انتقلتي لهذا المنزل؟" : "Have you moved in?"}
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        {ar
                            ? "إذا أصبح هذا منزلك الفعلي، أكّدي الانتقال لتفعيل خدمات الحي."
                            : "Confirm moving in to activate neighborhood services."}
                    </p>
                </div>
            </div>

            <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
                className="mt-4 min-h-11 w-full rounded-xl"
            >
                {mutation.isPending ? copy.confirming : copy.confirmMove}
            </Button>

            {mutation.isError && (
                <div className="mt-3">
                    <ErrorState error={mutation.error} />
                </div>
            )}

            {mutation.isSuccess && (
                <p role="status" className="mt-3 text-sm text-primary">
                    {copy.moveConfirmed}
                </p>
            )}
        </div>
    );
}

export function HomePanel({
                              showMap = true,
                              onCenterHome,
                          }: {
    showMap?: boolean;
    onCenterHome?: () => void;
}) {
    const locale = useLocale();
    const ar = locale === "ar";
    const copy = getProductCopy(locale);
    const t = useTranslations("Workspace");

    const { userId } = useIdentity();
    const cache = useQueryClient();

    const query = useHome(userId);
    const status = useHomeStatus(userId);
    const places = usePlaces(userId);

    const [open, setOpen] = useState(false);
    const [snapshot, setSnapshot] = useState<CurrentHome | null>(null);
    const [busy, setBusy] = useState(false);
    const [mapOpen, setMapOpen] = useState(true);

    if (query.isPending || status.isPending) {
        return <SummaryPanelSkeleton />;
    }

    if (status.isError && !status.data) {
        return (
            <ErrorState
                error={status.error}
                retry={() => void status.refetch()}
            />
        );
    }

    if (query.isError && !query.data) {
        return (
            <ErrorState
                error={query.error}
                retry={() => void query.refetch()}
            />
        );
    }

    const home = query.data;

    const refreshHomeData = async () => {
        await Promise.allSettled([
            invalidateUserData(cache, userId),
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

        await Promise.allSettled([
            query.refetch(),
            status.refetch(),
        ]);
    };

    const fields: FormField[] = [
        {
            name: "latitude",
            label: ar ? "موقع المنزل" : "Home location",
            fullWidth: true,
            render: (props) => (
                <CoordinateField
                    {...props}
                    presets={(places.data || []).map((place) => ({
                        ...place,
                        id: String(place.id),
                    }))}
                />
            ),
        },
    ];

    const homeStatus = status.data?.status;

    const statusText =
        homeStatus === "NO_HOME"
            ? copy.homeMissing
            : homeStatus === "HOME_SET"
                ? copy.homePending
                : copy.homeMoved;

    const hasListing = Boolean(
        home?.source && home?.externalPropertyId,
    );

    const listingHref =
        home?.source && home?.externalPropertyId
            ? `/properties/${encodeURIComponent(
                home.source,
            )}/${encodeURIComponent(home.externalPropertyId)}`
            : null;

    const openEditor = () => {
        setSnapshot(home || null);
        setOpen(true);
    };

    return (
        <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="p-5 sm:p-7">
                <QueryFeedback query={query} />

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <House className="size-5" />
            </span>

                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">
                                {t("currentHome")}
                            </h2>

                            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                                {home
                                    ? ar
                                        ? "موقع منزلك وتفاصيله في مكان واحد."
                                        : "Your home location and details in one place."
                                    : ar
                                        ? "أضيفي موقع منزلك لتبدئين الاستفادة من خدمات الحي."
                                        : "Add your home to get started."}
                            </p>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant={home ? "outline" : "default"}
                        onClick={openEditor}
                        className="min-h-10 gap-2 rounded-xl"
                    >
                        {home ? (
                            <Pencil className="size-4" />
                        ) : (
                            <MapPin className="size-4" />
                        )}

                        {home
                            ? t("edit")
                            : ar
                                ? "إضافة منزل"
                                : "Add home"}
                    </Button>
                </div>

                {!home ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-background text-primary">
              <MapPin className="size-6" />
            </span>

                        <h3 className="mt-4 text-base font-semibold">
                            {ar ? "ما أضفتي منزلك بعد" : "No home added yet"}
                        </h3>

                        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                            {ar
                                ? "حددي موقع منزلك على الخريطة، أو اختاري عقارًا من بيوتك المحفوظة."
                                : "Choose your home location or select a saved property."}
                        </p>

                        <Button
                            type="button"
                            onClick={openEditor}
                            className="mt-5 min-h-11 rounded-xl px-6"
                        >
                            {ar ? "تحديد موقع المنزل" : "Set home location"}
                        </Button>
                    </div>
                ) : (
                    <div className="mt-6 flex flex-col gap-5">
                        <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                <CheckCircle2 className="size-3.5" />
                  {ar ? "تم حفظ المنزل" : "Home saved"}
              </span>

                            <span className="text-xs text-muted-foreground">
                {statusText}
              </span>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-primary">
                    <MapPin className="size-4" />
                  </span>

                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold">
                                            {ar ? "موقع المنزل" : "Home location"}
                                        </h3>

                                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                                            {ar
                                                ? "موقع منزلك محفوظ على الخريطة."
                                                : "Your home location is saved on the map."}
                                        </p>
                                    </div>
                                </div>

                                {onCenterHome && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={onCenterHome}
                                        className="gap-2 rounded-xl"
                                    >
                                        <LocateFixed className="size-4" />
                                        {t("centerHome")}
                                    </Button>
                                )}
                            </div>

                            {hasListing && listingHref && (
                                <div className="mt-4 border-t border-border/60 pt-3">
                                    <Button
                                        nativeButton={false}
                                        render={<Link href={listingHref} />}
                                        variant="link"
                                        className="h-auto gap-2 p-0 text-sm"
                                    >
                                        {ar
                                            ? "عرض تفاصيل العقار"
                                            : "View property details"}
                                        <ArrowUpLeft className="size-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {showMap && (
                            <div className="overflow-hidden rounded-2xl border border-border/60">
                                <button
                                    type="button"
                                    aria-expanded={mapOpen}
                                    onClick={() => setMapOpen((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 bg-card px-4 py-4 text-start transition-colors hover:bg-secondary/30 sm:px-5"
                                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="size-4 text-primary" />
                      {ar ? "المنزل على الخريطة" : "Home on map"}
                  </span>

                                    <span className="text-xs text-muted-foreground">
                    {mapOpen
                        ? ar
                            ? "إخفاء الخريطة"
                            : "Hide map"
                        : ar
                            ? "عرض الخريطة"
                            : "Show map"}
                  </span>
                                </button>

                                {mapOpen && (
                                    <div className="border-t border-border/60">
                                        <MadarMap
                                            points={[
                                                {
                                                    ...home,
                                                    id: "home",
                                                    title: t("currentHome"),
                                                    provenance: "user",
                                                    kind: "home",
                                                },
                                            ]}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {home.id &&
                            homeStatus === "HOME_SET" && (
                                <ConfirmMove userId={userId} />
                            )}

                        {home.id && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
                                <p className="max-w-md text-xs leading-6 text-muted-foreground">
                                    {ar
                                        ? "تقدرين تغيّرين موقع منزلك أو تحذفينه في أي وقت."
                                        : "You can edit or remove your home at any time."}
                                </p>

                                <DeleteAction
                                    label={ar ? "حذف منزلي" : "Remove my home"}
                                    title={ar ? "حذف المنزل" : "Remove home"}
                                    description={
                                        ar
                                            ? "هل أنت متأكدة من حذف منزلك المحدد؟ لن يتم حذف الإعلان من بيوتك المحفوظة. إذا كانت لديك خطة انتقال، فقد تحتاجين إلى إعادة إنشائها للمنزل الجديد."
                                            : "Are you sure you want to remove your selected home? Your saved listing will remain. You may need to create a new moving checklist."
                                    }
                                    confirmLabel={
                                        ar ? "حذف المنزل" : "Remove home"
                                    }
                                    onDelete={async () => {
                                        const homeId = home.id;

                                        if (homeId == null) {
                                            throw new Error(
                                                ar
                                                    ? "تعذر تحديد المنزل المطلوب حذفه."
                                                    : "Home ID is missing.",
                                            );
                                        }

                                        // A successful DELETE is independent of
                                        // later cache refresh failures.
                                        await homeApi.remove(homeId);

                                        setMapOpen(false);

                                        await refreshHomeData();
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <TaskDialog
                open={open}
                onOpenChange={setOpen}
                busy={busy}
                title={
                    home
                        ? t("currentHome")
                        : ar
                            ? "إضافة منزل"
                            : "Add home"
                }
                description={
                    ar
                        ? "حددي موقع المنزل فقط. ما تحتاجين رقم إعلان أو مصدر إعلان. يُسجّل تاريخ الانتقال عندما تؤكدين السكن الفعلي."
                        : "Choose your home's location. You don't need a listing ID or source. Your move-in date is recorded only when you confirm moving in."
                }
            >
                <DataForm
                    schema={currentHomeSchema}
                    defaults={
                        snapshot
                            ? {
                                latitude: snapshot.latitude,
                                longitude: snapshot.longitude,
                                externalPropertyId:
                                    snapshot.externalPropertyId ?? "",
                                source: snapshot.source ?? "",
                            }
                            : {
                                latitude: "",
                                longitude: "",
                                externalPropertyId: "",
                                source: "",
                            }
                    }
                    fields={fields}
                    onCancel={() => setOpen(false)}
                    onSubmit={async (value) => {
                        setBusy(true);

                        try {
                            const body = {
                                latitude: value.latitude,
                                longitude: value.longitude,
                                externalPropertyId:
                                    snapshot?.externalPropertyId || undefined,
                                source: snapshot?.source || undefined,
                            };

                            if (snapshot?.id) {
                                await homeApi.update(snapshot.id, body);
                            } else {
                                await homeApi.add(body);
                            }

                            await refreshHomeData();

                            setOpen(false);
                            setSnapshot(null);
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            </TaskDialog>
        </section>
    );
}
