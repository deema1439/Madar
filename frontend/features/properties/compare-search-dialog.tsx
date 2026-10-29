
"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { credits } from "@/lib/api/credits";
import { discovery } from "@/lib/api/discovery";
import { useCurrentUserId } from "@/features/account/session-hooks";

type SearchProperty =
    Awaited<ReturnType<typeof discovery.search>>["data"][number];

type ComparedProperty = {
    externalPropertyId: string;
    source: string;
    title: string | null;
    neighborhood: string | null;
    price: number | null;
    bedrooms: number | null;
    areaSqm: number | null;
    matchScore: number | null;
    housingScore: number | null;
    commuteScore: number | null;
    servicesScore: number | null;
};

type ComparisonResult = {
    properties: ComparedProperty[];
    aiAnalysis: {
        recommendedExternalPropertyId: string | null;
        recommendedPropertyTitle: string | null;
        reason: string | null;
        alternativeReason: string | null;
        tradeOff: string | null;
    } | null;
};

type Props = {
    first: SearchProperty | null;
    properties: SearchProperty[];
    onClose: () => void;
};

export function CompareSearchDialog({
                                        first,
                                        properties,
                                        onClose,
                                    }: Props) {
    const locale = useLocale();
    const ar = locale === "ar";
    const userId = useCurrentUserId();
    const cache = useQueryClient();

    const [second, setSecond] = useState<SearchProperty | null>(null);
    const [confirming, setConfirming] = useState(false);

    const prices = useQuery({
        queryKey: ["credit-service-prices", userId],
        queryFn: ({ signal }) => credits.servicePrices(signal),
        enabled: !!first && userId !== null,
    });

    const balance = useQuery({
        queryKey: ["credit-balance", userId],
        queryFn: ({ signal }) => credits.balance(signal),
        enabled: !!first && userId !== null,
    });

    const cost = prices.data?.AI_COMPARISON;
    const insufficient =
        cost != null &&
        balance.data != null &&
        balance.data.balance < cost;

    const comparison = useMutation({
        mutationFn: async () => {
            if (!first || !second) throw new Error("Select two properties");

            const path = [
                "/api/v1/property-comparison/me/compare-two",
                encodeURIComponent(first.source),
                encodeURIComponent(String(first.externalId)),
                encodeURIComponent(second.source),
                encodeURIComponent(String(second.externalId)),
            ].join("/");

            return apiRequest<ComparisonResult>(path, {
                headers: { "Accept-Language": ar ? "ar" : "en" },
            });
        },
        retry: 0,
        onSettled: async () => {
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

    if (!first) return null;

    const alternatives = properties.filter(
        (p) =>
            p.externalId &&
            !(p.source === first.source && p.externalId === first.externalId),
    );

    const money = (value: number | null | undefined) =>
        value == null
            ? "—"
            : new Intl.NumberFormat(locale).format(value);

    const close = () => {
        if (!comparison.isPending) {
            setSecond(null);
            setConfirming(false);
            comparison.reset();
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:p-6"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label={ar ? "مقارنة العقارات" : "Compare properties"}
                dir={ar ? "rtl" : "ltr"}
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-2xl"            >
                <header className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-5 sm:px-7">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-primary">
                            <ArrowRightLeft className="size-4" />
                            <span className="text-xs font-medium">
                {ar ? "مقارنة العقارات" : "Property comparison"}
              </span>
                        </div>
                        <h2 className="text-xl font-semibold">
                            {ar ? "قارن مع عقار آخر" : "Compare with another property"}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {ar
                                ? "اختر عقارًا ثانيًا من نتائج البحث الحالية."
                                : "Choose another property from your current results."}
                        </p>
                    </div>

                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={close}
                        disabled={comparison.isPending}
                        aria-label={ar ? "إغلاق" : "Close"}
                    >
                        <X className="size-5" />
                    </Button>
                </header>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <p className="mb-1 text-xs text-muted-foreground">
                            {ar ? "العقار الأول" : "First property"}
                        </p>
                        <p className="font-semibold">
                            {first.title || (ar ? "عقار مختار" : "Selected property")}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {money(first.price)} {ar ? "ر.س" : "SAR"}
                        </p>
                    </div>

                    {!comparison.data && (
                        <>
                            <h3 className="text-sm font-semibold">
                                {ar ? "اختر العقار الثاني" : "Choose the second property"}
                            </h3>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {alternatives.map((property) => {
                                    const selected =
                                        second?.source === property.source &&
                                        second?.externalId === property.externalId;

                                    return (
                                        <button
                                            type="button"
                                            key={`${property.source}:${property.externalId}`}
                                            onClick={() => {
                                                setSecond(property);
                                                setConfirming(false);
                                                comparison.reset();
                                            }}
                                            className={`flex min-w-0 items-start justify-between gap-3 rounded-2xl border p-4 text-start transition-colors ${
                                                selected
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border/70 bg-card hover:border-primary/40"
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 text-sm font-semibold">
                                                    {property.title ||
                                                        (ar ? "عقار بدون عنوان" : "Untitled property")}
                                                </p>
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    {money(property.price)} {ar ? "ر.س" : "SAR"}
                                                </p>
                                            </div>
                                            {selected && (
                                                <Check className="size-5 shrink-0 text-primary" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {alternatives.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    {ar
                                        ? "ما فيه عقار ثانٍ ضمن النتائج المحمّلة. حمّلي المزيد من النتائج أولًا."
                                        : "No other loaded property. Load more search results first."}
                                </p>
                            )}

                            {second && (
                                <div className="space-y-4 rounded-2xl border border-border/70 bg-secondary/20 p-4">
                                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>
                      {ar ? "تكلفة المقارنة الذكية" : "AI comparison cost"}
                    </span>
                                        <strong>
                                            {cost == null ? "—" : money(cost)}{" "}
                                            {ar ? "كريدت" : "credits"}
                                        </strong>
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        {ar ? "رصيدك الحالي:" : "Current balance:"}{" "}
                                        {money(balance.data?.balance)}
                                    </p>

                                    {insufficient && (
                                        <p className="text-sm text-destructive">
                                            {ar
                                                ? "رصيدك غير كافٍ لإجراء المقارنة."
                                                : "Insufficient credits for this comparison."}
                                        </p>
                                    )}

                                    {!confirming ? (
                                        <Button
                                            className="w-full"
                                            disabled={
                                                cost == null ||
                                                balance.data == null ||
                                                insufficient ||
                                                prices.isError ||
                                                balance.isError
                                            }
                                            onClick={() => setConfirming(true)}
                                        >
                                            {ar ? "متابعة إلى التأكيد" : "Continue to confirmation"}
                                        </Button>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-sm">
                                                {ar
                                                    ? `هل تؤكدين إجراء المقارنة مقابل ${money(cost)} كريدت؟`
                                                    : `Confirm comparison for ${money(cost)} credits?`}
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setConfirming(false)}
                                                    disabled={comparison.isPending}
                                                >
                                                    {ar ? "إلغاء" : "Cancel"}
                                                </Button>
                                                <Button
                                                    disabled={comparison.isPending || insufficient}
                                                    onClick={() => {
                                                        setConfirming(false);
                                                        comparison.mutate();
                                                    }}
                                                >
                                                    {ar ? "تأكيد المقارنة" : "Confirm comparison"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {comparison.isPending && (
                        <div role="status" className="flex items-center gap-3 py-6">
                            <LoaderCircle className="size-5 animate-spin text-primary" />
                            <p className="text-sm">
                                {ar
                                    ? "جاري تحليل العقارين..."
                                    : "Analyzing both properties..."}
                            </p>
                        </div>
                    )}

                    {comparison.isError && (
                        <div role="alert" className="rounded-xl border border-destructive/30 p-4">
                            <p className="text-sm text-destructive">
                                {ar
                                    ? "تعذرت المقارنة حاليًا. قد تكون إحدى الخدمات الخارجية غير متاحة."
                                    : "Comparison failed. An external service may be unavailable."}
                            </p>
                        </div>
                    )}


                    {comparison.data && (
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="mb-1 text-xs font-medium text-primary">
                                        {ar ? "تحليل مدار الذكي" : "Madar smart analysis"}
                                    </p>
                                    <h3 className="text-xl font-semibold">
                                        {ar ? "نتيجة مقارنة العقارين" : "Property comparison results"}
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {ar
                                            ? "نظرة واضحة تساعدك على اختيار البيت الأنسب."
                                            : "A clearer view to help you choose the right home."}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                {comparison.data.properties.map((property, index) => {
                                    const recommended =
                                        comparison.data?.aiAnalysis?.recommendedExternalPropertyId ===
                                        property.externalPropertyId;

                                    const metrics = [
                                        {
                                            label: ar ? "درجة المطابقة" : "Match score",
                                            value: property.matchScore,
                                        },
                                        {
                                            label: ar ? "ملاءمة السكن" : "Housing suitability",
                                            value: property.housingScore,
                                        },
                                        {
                                            label: ar ? "التنقل" : "Commute",
                                            value: property.commuteScore,
                                        },
                                        {
                                            label: ar ? "الخدمات" : "Services",
                                            value: property.servicesScore,
                                        },
                                    ];

                                    return (
                                        <div
                                            key={`${property.source}:${property.externalPropertyId}`}
                                            className={`min-w-0 overflow-hidden rounded-[24px] border bg-card ${
                                                recommended
                                                    ? "border-primary/50 shadow-sm"
                                                    : "border-border/70"
                                            }`}
                                        >
                                            <div className="border-b border-border/60 p-5">
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                  {ar ? `العقار ${index + 1}` : `Property ${index + 1}`}
                </span>
                                                    {recommended && (
                                                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {ar ? "اختيار مدار" : "Madar's pick"}
                  </span>
                                                    )}
                                                </div>

                                                <h4
                                                    dir="auto"
                                                    className="line-clamp-2 min-h-12 text-base font-semibold leading-6"
                                                >
                                                    {property.title || (ar ? "عقار سكني" : "Residential property")}
                                                </h4>

                                                <p className="mt-3 text-2xl font-semibold tabular-nums">
                                                    {property.price == null ? "—" : money(property.price)}
                                                    {property.price != null && (
                                                        <span className="ms-2 text-sm font-normal text-muted-foreground">
                    {ar ? "ر.س" : "SAR"}
                  </span>
                                                    )}
                                                </p>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {property.areaSqm != null && (
                                                        <span className="rounded-lg bg-secondary/70 px-3 py-2 text-xs">
                    {money(property.areaSqm)} {ar ? "م²" : "m²"}
                  </span>
                                                    )}
                                                    {property.bedrooms != null && (
                                                        <span className="rounded-lg bg-secondary/70 px-3 py-2 text-xs">
                    {money(property.bedrooms)}{" "}
                                                            {ar ? "غرف نوم" : "Bedrooms"}
                  </span>
                                                    )}
                                                    {property.neighborhood && (
                                                        <span className="rounded-lg bg-secondary/70 px-3 py-2 text-xs">
                    {property.neighborhood}
                  </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-5 p-5">
                                                {metrics.map((metric) => (
                                                    <div key={metric.label} className="space-y-2">
                                                        <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {metric.label}
                    </span>
                                                            <span className="font-semibold tabular-nums">
                      {metric.value == null
                          ? "—"
                          : `${new Intl.NumberFormat(locale, {
                              maximumFractionDigits: 1,
                          }).format(metric.value)}%`}
                    </span>
                                                        </div>

                                                        <div
                                                            className="h-2 overflow-hidden rounded-full bg-secondary"
                                                            role="progressbar"
                                                            aria-label={metric.label}
                                                            aria-valuemin={0}
                                                            aria-valuemax={100}
                                                            aria-valuenow={
                                                                metric.value == null
                                                                    ? undefined
                                                                    : Math.max(0, Math.min(100, metric.value))
                                                            }
                                                        >
                                                            <div
                                                                className={`h-full rounded-full transition-all ${
                                                                    metric.value == null
                                                                        ? "bg-transparent"
                                                                        : "bg-primary"
                                                                }`}
                                                                style={{
                                                                    width: `${
                                                                        metric.value == null
                                                                            ? 0
                                                                            : Math.max(0, Math.min(100, metric.value))
                                                                    }%`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {comparison.data.aiAnalysis && (
                                <section className="overflow-hidden rounded-[24px] border border-border/70 bg-card">
                                    <div className="border-b border-border/60 bg-secondary/25 px-5 py-5 sm:px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                <span className="text-lg">✦</span>
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium text-primary">
                                                    MADAR AI
                                                </p>
                                                <h4 className="text-lg font-semibold">
                                                    {ar ? "رأي مساعد مدار الذكي" : "Madar AI recommendation"}
                                                </h4>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-5 p-5 sm:p-6">
                                        {comparison.data.aiAnalysis.recommendedPropertyTitle && (
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    {ar ? "العقار الذي يرشحه مدار" : "Madar recommends"}
                                                </p>
                                                <p
                                                    dir={ar ? "rtl" : "ltr"}
                                                    className="max-w-3xl break-words text-start text-base font-semibold leading-7 text-primary"
                                                >
                                                    <bdi dir="auto">
                                                        {comparison.data.aiAnalysis.recommendedPropertyTitle}
                                                    </bdi>
                                                </p>
                                            </div>
                                        )}

                                        {comparison.data.aiAnalysis.reason && (
                                            <div className="space-y-2">
                                                <h5 className="text-sm font-semibold">
                                                    {ar ? "لماذا هذا الاختيار؟" : "Why this property?"}
                                                </h5>
                                                <p
                                                    dir={ar ? "rtl" : "ltr"}
                                                    className="max-w-3xl whitespace-pre-line break-words text-start text-sm leading-8"
                                                >
                                                    {comparison.data.aiAnalysis.reason}
                                                </p>
                                            </div>
                                        )}

                                        {comparison.data.aiAnalysis.alternativeReason && (
                                            <div className="space-y-2 border-t border-border/60 pt-5">
                                                <h5 className="text-sm font-semibold">
                                                    {ar ? "وماذا عن العقار الآخر؟" : "What about the alternative?"}
                                                </h5>
                                                <p
                                                    dir={ar ? "rtl" : "ltr"}
                                                    className="max-w-3xl whitespace-pre-line break-words text-start text-sm leading-8 text-muted-foreground"
                                                >
                                                    {comparison.data.aiAnalysis.alternativeReason}
                                                </p>
                                            </div>
                                        )}

                                        {comparison.data.aiAnalysis.tradeOff && (
                                            <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-4">
                                                <h5 className="text-sm font-semibold">
                                                    {ar ? "نقاط تستحق الانتباه" : "Things to consider"}
                                                </h5>
                                                <p
                                                    dir={ar ? "rtl" : "ltr"}
                                                    className="max-w-3xl whitespace-pre-line break-words text-start text-sm leading-7 text-muted-foreground"
                                                >
                                                    {comparison.data.aiAnalysis.tradeOff}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            <div className="flex justify-end border-t border-border/60 pt-4">
                                <Button variant="outline" onClick={close}>
                                    {ar ? "إغلاق المقارنة" : "Close comparison"}
                                </Button>
                            </div>
                        </div>
                    )}

                </div>
            </section>
        </div>
    );
}
