
"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocale } from "next-intl";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  History,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { formatTimestamp } from "@/lib/format-timestamp";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { getProductCopy } from "@/messages/product-copy";
import { getLayoutCopy } from "@/messages/layout-copy";
import { QueryFeedback } from "@/components/shared/query-feedback";
import {
  PaymentHistorySkeleton,
  PaymentVerificationSkeleton,
} from "@/features/payments/skeletons";
import { SummarySkeleton } from "@/components/shared/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { useIdentity } from "@/features/account/identity";
import {
  credits,
  packagePriceHalalas,
  type CreditPackage,
} from "@/lib/api/credits";
import { payments } from "@/lib/api/payments";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  Payment,
  Checkout,
} from "@/lib/api/discovery-contracts";
import { CommutePanel } from "./commute-panel";
import { MoyasarForm } from "./moyasar-form";
import { validCoordinates } from "@/lib/maps/points";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 4;
const VERIFY_INTERVAL = 3000;
const VERIFY_TIMEOUT = 60000;

const knownPaymentStatuses = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;

const creditServiceLabels: Record<string, [string, string]> = {
  TOP_3_RECOMMENDATIONS: [
    "التوصيات الذكية",
    "Smart recommendations",
  ],
  AI_CHAT: ["محادثة مدار", "Madar AI chat"],
  AI_COMPARISON: ["تحليل المقارنة", "AI comparison"],
  COMMUTE_REPORT: ["تقرير التنقل", "Commute report"],
};

const creditServiceDescriptions: Record<
    string,
    [string, string]
> = {
  TOP_3_RECOMMENDATIONS: [
    "اقتراحات سكنية تناسب تفضيلاتك.",
    "Personalized housing recommendations.",
  ],
  AI_CHAT: [
    "مساعدة ذكية أثناء البحث عن سكن.",
    "Smart assistance during your housing search.",
  ],
  AI_COMPARISON: [
    "تحليل ذكي لمقارنة العقارات.",
    "AI-powered property comparison.",
  ],
  COMMUTE_REPORT: [
    "تحليل التنقل إلى أماكنك المهمة.",
    "Commute analysis for your important places.",
  ],
};

const creditActivityLabels: Record<
    string,
    [string, string]
> = {
  WELCOME_BONUS: ["رصيد ترحيبي", "Welcome credits"],
  RESERVED: ["رصيد محجوز", "Reserved credits"],
  CONSUMED: ["استخدام رصيد", "Credits used"],
  CANCELLED: ["إلغاء حجز", "Reservation cancelled"],
  REFUND: ["إرجاع رصيد", "Credits returned"],
  PURCHASE: ["شراء كريدت", "Credit purchase"],
  PURCHASE_REFUND: [
    "استرداد شراء",
    "Purchase refund",
  ],
  ADMIN_GIFT: ["رصيد مضاف", "Credits added"],
};

function formatCredits(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSar(amountHalalas: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountHalalas / 100);
}

function formatCurrency(
    amountMinor: number,
    currency: string,
    locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function creditDescription(
    description: string | null,
    ar: boolean,
) {
  if (!description) return null;

  if (description === "Credits purchased via Moyasar") {
    return ar
        ? "تمت إضافة الكريدت بعد تأكيد الدفع."
        : description;
  }

  if (description.startsWith("Service: ")) {
    const code = description.slice("Service: ".length);
    const labels = creditServiceLabels[code];

    if (labels) {
      return ar
          ? `الخدمة: ${labels[0]}`
          : `Service: ${labels[1]}`;
    }
  }

  return description;
}

function statusLabel(status: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    PENDING: ["قيد التأكيد", "Pending"],
    PAID: ["مدفوع", "Paid"],
    FAILED: ["فشلت العملية", "Failed"],
    REFUNDED: ["مسترد", "Refunded"],
  };

  return labels[status]?.[ar ? 0 : 1] ?? status;
}

function paymentBadgeVariant(
    status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PAID") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "REFUNDED") return "outline";
  return "secondary";
}

function SectionHeader({
                         icon: Icon,
                         title,
                         description,
                         action,
                       }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>

          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              {title}
            </h2>

            {description && (
                <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">
                  {description}
                </p>
            )}
          </div>
        </div>

        {action}
      </div>
  );
}

function Pagination({
                      page,
                      total,
                      onChange,
                      ar,
                    }: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  ar: boolean;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);

  if (pages <= 1) return null;

  return (
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
        >
          <ChevronRight className="size-4" />
          {ar ? "السابق" : "Previous"}
        </Button>

        <span className="text-xs text-muted-foreground">
        {ar ? "صفحة" : "Page"}{" "}
          {formatCredits(page, ar ? "ar" : "en")}{" "}
          {ar ? "من" : "of"}{" "}
          {formatCredits(pages, ar ? "ar" : "en")}
      </span>

        <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
        >
          {ar ? "التالي" : "Next"}
          <ChevronLeft className="size-4" />
        </Button>
      </div>
  );
}

function CreditPackageCard({
                             item,
                             selected,
                             locale,
                             onSelect,
                             disabled,
                           }: {
  item: CreditPackage;
  selected: boolean;
  locale: string;
  onSelect: () => void;
  disabled: boolean;
}) {
  const ar = locale === "ar";
  const finalPrice = packagePriceHalalas(item);
  const unitPriceHalalas = finalPrice / item.credits;

  return (
      <article
          className={cn(
              "flex h-full flex-col rounded-2xl border bg-card p-5 transition-all",
              selected
                  ? "border-primary ring-2 ring-primary/15"
                  : "border-border/70 hover:border-primary/40",
          )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">
            {item.name}
          </h3>

          {item.discountPercent > 0 && (
              <Badge variant="secondary">
                {item.discountPercent}%{" "}
                {ar ? "خصم" : "off"}
              </Badge>
          )}
        </div>

        <div className="mt-6">
          <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {formatCredits(item.credits, locale)}
          </span>
            <span className="text-sm text-muted-foreground">
            {ar ? "كريدت" : "credits"}
          </span>
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {formatSar(finalPrice, locale)}
          </span>

            {item.discountPercent > 0 && (
                <span className="text-sm text-muted-foreground line-through">
              {formatSar(item.priceHalalas, locale)}
            </span>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {formatSar(unitPriceHalalas, locale)}{" "}
            {ar ? "للكريدت الواحد" : "per credit"}
          </p>
        </div>

        <Button
            type="button"
            variant={selected ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={selected}
            onClick={onSelect}
            className="mt-6 min-h-11 w-full rounded-xl"
        >
          {selected
              ? ar
                  ? "تم الاختيار"
                  : "Selected"
              : ar
                  ? "اختر الباقة"
                  : "Select package"}
        </Button>
      </article>
  );
}

function PaymentTable({
                        rows,
                        packages,
                        locale,
                        onVerify,
                        verifyingId,
                      }: {
  rows: Payment[];
  packages: CreditPackage[];
  locale: string;
  onVerify: (id: number) => void;
  verifyingId: number | null;
}) {
  const ar = locale === "ar";

  const packageName = (serviceType: string) =>
      serviceType === "COMMUTE_REPORT"
          ? ar
              ? "تقرير التنقل"
              : "Commute report"
          : packages.find(
          (item) => item.code === serviceType,
      )?.name ?? serviceType;

  return (
      <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[620px] text-start text-sm">
            <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">
                {ar ? "العملية" : "Transaction"}
              </th>
              <th className="px-3 py-3 font-medium">
                {ar ? "المبلغ" : "Amount"}
              </th>
              <th className="px-3 py-3 font-medium">
                {ar ? "التاريخ" : "Date"}
              </th>
              <th className="px-3 py-3 font-medium">
                {ar ? "الحالة" : "Status"}
              </th>
              <th className="px-3 py-3 font-medium">
                <span className="sr-only">
                  {ar ? "إجراء" : "Action"}
                </span>
              </th>
            </tr>
            </thead>

            <tbody className="divide-y divide-border/60">
            {rows.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">
                      {packageName(payment.serviceType)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      #{payment.id}
                    </p>
                  </td>

                  <td className="px-3 py-3 font-medium tabular-nums">
                    {payment.currency
                        ? formatCurrency(
                            payment.amount,
                            payment.currency,
                            locale,
                        )
                        : "—"}
                  </td>

                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatTimestamp(
                        payment.createdAt,
                        locale,
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <Badge
                        variant={paymentBadgeVariant(
                            payment.status,
                        )}
                    >
                      {statusLabel(payment.status, ar)}
                    </Badge>
                  </td>

                  <td className="px-3 py-3 text-end">
                    {payment.status === "PENDING" && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={verifyingId !== null}
                            onClick={() => onVerify(payment.id)}
                        >
                          <RefreshCw
                              className={cn(
                                  "size-4",
                                  verifyingId === payment.id &&
                                  "animate-spin",
                              )}
                          />
                          {ar ? "تحقق" : "Verify"}
                        </Button>
                    )}
                  </td>
                </tr>
            ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {rows.map((payment) => (
              <article
                  key={payment.id}
                  className="rounded-2xl border border-border/70 bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      {packageName(payment.serviceType)}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      #{payment.id} ·{" "}
                      {formatTimestamp(
                          payment.createdAt,
                          locale,
                      )}
                    </p>
                  </div>

                  <Badge
                      variant={paymentBadgeVariant(
                          payment.status,
                      )}
                  >
                    {statusLabel(payment.status, ar)}
                  </Badge>
                </div>

                <p className="mt-3 text-lg font-semibold tabular-nums">
                  {payment.currency
                      ? formatCurrency(
                          payment.amount,
                          payment.currency,
                          locale,
                      )
                      : "—"}
                </p>

                {payment.status === "PENDING" && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={verifyingId !== null}
                        onClick={() => onVerify(payment.id)}
                        className="mt-3 w-full"
                    >
                      <RefreshCw
                          className={cn(
                              "size-4",
                              verifyingId === payment.id &&
                              "animate-spin",
                          )}
                      />
                      {ar
                          ? "تحقق من الحالة"
                          : "Verify status"}
                    </Button>
                )}
              </article>
          ))}
        </div>
      </>
  );
}

type PaymentSuccessDetails = {
  paymentId: number;
  serviceType: string;
};

function PaymentSuccessDialog({
                                ar,
                                locale,
                                balance,
                                addedCredits,
                                loading,
                                onClose,
                              }: {
  ar: boolean;
  locale: string;
  balance: number | null;
  addedCredits: number | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-success-title"
            className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-7 text-center shadow-xl"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-9" />
          </div>

          <h2
              id="payment-success-title"
              className="mt-5 text-xl font-semibold"
          >
            {ar
                ? "تم الدفع بنجاح!"
                : "Payment successful!"}
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {addedCredits !== null
                ? ar
                    ? `تمت إضافة ${formatCredits(addedCredits, locale)} كريدت إلى محفظتك.`
                    : `${formatCredits(addedCredits, locale)} credits were added to your wallet.`
                : ar
                    ? "تم تأكيد الدفع بنجاح."
                    : "Your payment was confirmed."}
          </p>

          <div className="mt-5 rounded-2xl bg-secondary/35 p-4">
            <p className="text-xs text-muted-foreground">
              {ar ? "رصيدك الحالي" : "Current balance"}
            </p>

            {loading ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {ar
                      ? "جارٍ تحديث الرصيد..."
                      : "Refreshing balance..."}
                </p>
            ) : balance !== null ? (
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatCredits(balance, locale)}
                  <span className="ms-2 text-sm font-normal">
                {ar ? "كريدت" : "credits"}
              </span>
                </p>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {ar
                      ? "تعذر عرض الرصيد حاليًا."
                      : "Balance is currently unavailable."}
                </p>
            )}
          </div>

          <Button
              type="button"
              className="mt-6 min-h-11 w-full rounded-xl"
              onClick={onClose}
          >
            {ar ? "متابعة استخدام مدار" : "Continue"}
          </Button>
        </div>
      </div>
  );
}

export function PaymentsPage() {
  const locale = useLocale();
  const ar = locale === "ar";
  const copy = getLayoutCopy(locale);
  const { userId } = useIdentity();
  const cache = useQueryClient();

  const [status, setStatus] = useState("");
  const [selectedCode, setSelectedCode] = useState<
      string | null
  >(null);
  const [checkout, setCheckout] = useState<
      Checkout | null
  >(null);
  const [verified, setVerified] = useState<
      Payment | null
  >(null);

  const [creditPage, setCreditPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  const [paymentSuccess, setPaymentSuccess] =
      useState<PaymentSuccessDetails | null>(null);

  const [successBalance, setSuccessBalance] =
      useState<number | null>(null);

  const [successLoading, setSuccessLoading] =
      useState(false);


  const balance = useQuery({
    queryKey: ["credit-balance", userId],
    queryFn: ({ signal }) => credits.balance(signal),
    retry: false,
  });

  const packages = useQuery({
    queryKey: ["credit-packages"],
    queryFn: ({ signal }) => credits.packages(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const servicePrices = useQuery({
    queryKey: ["credit-service-prices", userId],
    queryFn: ({ signal }) =>
        credits.servicePrices(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const transactions = useQuery({
    queryKey: ["credit-transactions", userId],
    queryFn: ({ signal }) =>
        credits.transactions(signal),
    retry: false,
  });

  const paymentHistory = useQuery({
    queryKey: ["payments", userId, status],
    queryFn: ({ signal }) =>
        payments.history(status || undefined, signal),
    retry: false,
  });

  const selectedPackage =
      packages.data?.find(
          (item) => item.code === selectedCode,
      ) ?? null;
  useEffect(() => {
    if (userId == null) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get("payment_return") !== "1") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    let storedId: string | null = null;

    try {
      storedId =
          sessionStorage.getItem(`madar-payment:${userId}`) ||
          sessionStorage.getItem("madar-last-payment-id");
    } catch {
      return;
    }

    const paymentId = Number(storedId);

    if (
        !storedId ||
        !Number.isSafeInteger(paymentId) ||
        paymentId <= 0
    ) {
      return;
    }

    const clearReturnUrl = () => {
      const url = new URL(window.location.href);

      url.searchParams.delete("payment_return");

      window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
      );
    };

    const checkPayment = async () => {
      if (cancelled) return;

      try {
        const payment = await payments.verify(paymentId);

        if (cancelled) return;

        if (payment.status === "PAID") {
          if (payment.serviceType === "COMMUTE_REPORT") {
            clearReturnUrl();
            return;
          }

          setSuccessLoading(true);
          setSuccessBalance(null);

          const [freshBalance] = await Promise.all([
            credits.balance(),
            cache.invalidateQueries({
              queryKey: ["credit-transactions", userId],
            }),
            cache.invalidateQueries({
              queryKey: ["payments", userId],
            }),
          ]);

          if (cancelled) return;

          cache.setQueryData(
              ["credit-balance", userId],
              freshBalance,
          );

          setSuccessBalance(freshBalance.balance);

          setPaymentSuccess({
            paymentId: payment.id,
            serviceType: payment.serviceType,
          });

          setSuccessLoading(false);

          try {
            sessionStorage.removeItem(
                `madar-payment:${userId}`,
            );

            sessionStorage.removeItem(
                "madar-last-payment-id",
            );

            sessionStorage.removeItem(
                `madar-credit-checkout-key:${userId}:${payment.serviceType}`,
            );
          } catch {
            // Storage may be unavailable.
          }

          clearReturnUrl();
          return;
        }

        if (
            payment.status === "FAILED" ||
            payment.status === "REFUNDED"
        ) {
          await cache.invalidateQueries({
            queryKey: ["payments", userId],
          });

          if (!cancelled) clearReturnUrl();
          return;
        }

        if (Date.now() - startedAt < 60000) {
          timer = setTimeout(checkPayment, 3000);
        }
      } catch {
        if (!cancelled && Date.now() - startedAt < 60000) {
          timer = setTimeout(checkPayment, 3000);
        }
      }
    };

    void checkPayment();

    return () => {
      cancelled = true;

      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [userId, cache]);

  const createCheckout = useMutation({
    mutationFn: async (item: CreditPackage) => {
      const storageKey =
          `madar-credit-checkout-key:${userId}:${item.code}`;

      let idempotencyKey: string;

      try {
        idempotencyKey =
            sessionStorage.getItem(storageKey) ||
            crypto.randomUUID();

        sessionStorage.setItem(
            storageKey,
            idempotencyKey,
        );
      } catch {
        throw new Error(
            ar
                ? "تعذر حفظ محاولة الدفع. تحقق من إعدادات المتصفح."
                : "Unable to save the checkout session.",
        );
      }

      const response = await payments.checkout(
          idempotencyKey,
          item.code,
      );

      sessionStorage.setItem(
          "madar-last-payment-id",
          String(response.paymentId),
      );

      sessionStorage.setItem(
          `madar-payment:${userId}`,
          String(response.paymentId),
      );

      return response;
    },
    retry: false,
    onSuccess: async (response) => {
      setCheckout(response);

      await cache.invalidateQueries({
        queryKey: ["payments", userId],
      });
    },
  });

  const verify = useMutation({
    mutationFn: (id: number) => payments.verify(id),
    onMutate: () => setVerified(null),
    onSuccess: async (payment) => {
      setVerified(payment);

      if (
          payment.status !== "PENDING" &&
          payment.serviceType !== "COMMUTE_REPORT"
      ) {
        try {
          sessionStorage.removeItem(
              `madar-credit-checkout-key:${userId}:${payment.serviceType}`,
          );
        } catch {
          // Verification is still authoritative.
        }
      }

      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["payments", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["credit-balance", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["credit-transactions", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["access", userId],
        }),
      ]);
    },
  });

  const serviceLabel = (code: string) =>
      creditServiceLabels[code]?.[ar ? 0 : 1] ??
      code.replaceAll("_", " ");

  const allHistoryRows = paymentHistory.data ?? [];
  const allCreditRows = transactions.data ?? [];

  const creditPages = Math.max(
      1,
      Math.ceil(allCreditRows.length / PAGE_SIZE),
  );

  const paymentPages = Math.max(
      1,
      Math.ceil(allHistoryRows.length / PAGE_SIZE),
  );

  const currentCreditPage = Math.min(
      creditPage,
      creditPages,
  );

  const currentPaymentPage = Math.min(
      paymentPage,
      paymentPages,
  );

  const creditRows = allCreditRows.slice(
      (currentCreditPage - 1) * PAGE_SIZE,
      currentCreditPage * PAGE_SIZE,
  );

  const historyRows = allHistoryRows.slice(
      (currentPaymentPage - 1) * PAGE_SIZE,
      currentPaymentPage * PAGE_SIZE,
  );

  const addedCredits = paymentSuccess
      ? packages.data?.find(
      (item) =>
          item.code === paymentSuccess.serviceType,
  )?.credits ?? null
      : null;

  return (
      <div className="flex w-full max-w-[1480px] flex-col gap-5 pb-10">
        <PageHeading
            title={
              ar
                  ? "المحفظة والمدفوعات"
                  : "Payments & Credits"
            }
            description={
              ar
                  ? "تابع رصيدك، اختر باقتك، واستعرض عملياتك."
                  : "Manage your credits, packages, and payments."
            }
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* WALLET BALANCE */}
            <section className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-sm">
              <div className="flex flex-col gap-5 bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                  <p className="text-sm text-primary-foreground/75">
                    {ar
                        ? "رصيدك الحالي"
                        : "Available credit balance"}
                  </p>

                  {balance.isPending ? (
                      <div className="mt-3 h-10 w-36 animate-pulse rounded-lg bg-primary-foreground/15" />
                  ) : balance.isError ? (
                      <p className="mt-3 text-sm">
                        {ar
                            ? "تعذر تحميل الرصيد"
                            : "Balance unavailable"}
                      </p>
                  ) : (
                      <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tabular-nums sm:text-5xl">
                      {formatCredits(
                          balance.data.balance,
                          locale,
                      )}
                    </span>
                        <span className="text-sm text-primary-foreground/75">
                      {ar ? "كريدت" : "credits"}
                    </span>
                      </p>
                  )}

                  <p className="mt-2 text-xs text-primary-foreground/75">
                    {ar
                        ? "رصيدك المتاح لاستخدام خدمات مدار."
                        : "Your available balance for Madar services."}
                  </p>
                </div>

                <Button
                    nativeButton={false}
                    render={<a href="#credit-activity" />}
                    variant="outline"
                    className="min-h-11 rounded-xl border-primary-foreground/30 bg-primary/20 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <History data-icon="inline-start" />
                  {ar
                      ? "سجل الاستخدام"
                      : "Credit activity"}
                </Button>
              </div>

              {balance.isError && (
                  <div className="p-5">
                    <ErrorState
                        error={balance.error}
                        retry={() => void balance.refetch()}
                    />
                  </div>
              )}
            </section>

            {/* CREDIT PACKAGES */}
            <section
                id="credit-packages"
                className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
            >
              <SectionHeader
                  icon={WalletCards}
                  title={
                    ar ? "باقات الكريدت" : "Credit packages"
                  }
                  description={
                    ar
                        ? "اختر الباقة المناسبة لك."
                        : "Choose the package that suits you."
                  }
              />

              <div className="mt-5">
                <QueryFeedback query={packages} />

                {packages.isPending ? (
                    <PaymentHistorySkeleton />
                ) : packages.isError ? (
                    <ErrorState
                        error={packages.error}
                        retry={() => void packages.refetch()}
                    />
                ) : !packages.data.length ? (
                    <EmptyState
                        title={
                          ar
                              ? "لا توجد باقات متاحة حاليًا"
                              : "No packages available"
                        }
                        description={
                          ar
                              ? "تحقق مرة أخرى لاحقًا."
                              : "Please check again later."
                        }
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                      {packages.data.map((item) => (
                          <CreditPackageCard
                              key={item.id}
                              item={item}
                              locale={locale}
                              selected={
                                  selectedCode === item.code
                              }
                              disabled={Boolean(checkout)}
                              onSelect={() => {
                                setSelectedCode(item.code);
                                createCheckout.reset();
                                setVerified(null);
                              }}
                          />
                      ))}
                    </div>
                )}
              </div>
            </section>

            {/* SERVICE PRICES */}
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeader
                  icon={BadgeCheck}
                  title={
                    ar
                        ? "تكلفة خدمات مدار"
                        : "Madar service costs"
                  }
                  description={
                    ar
                        ? "تعرف على تكلفة كل خدمة بالكريدت."
                        : "Explore service costs in credits."
                  }
              />

              <div className="mt-4">
                <QueryFeedback query={servicePrices} />

                {servicePrices.isPending ? (
                    <SummarySkeleton />
                ) : servicePrices.isError ? (
                    <ErrorState
                        error={servicePrices.error}
                        retry={() =>
                            void servicePrices.refetch()
                        }
                    />
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(
                          servicePrices.data,
                      ).map(([code, cost]) => (
                          <div
                              key={code}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-4"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {serviceLabel(code)}
                              </p>

                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {creditServiceDescriptions[
                                    code
                                    ]?.[ar ? 0 : 1] ?? code}
                              </p>
                            </div>

                            <p className="shrink-0 font-semibold tabular-nums">
                              {formatCredits(cost, locale)}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                          {ar ? "كريدت" : "credits"}
                        </span>
                            </p>
                          </div>
                      ))}
                    </div>
                )}
              </div>
            </section>

            {/* CREDIT ACTIVITY */}
            <section
                id="credit-activity"
                className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
            >
              <SectionHeader
                  icon={History}
                  title={
                    ar
                        ? "سجل استخدام الكريدت"
                        : "Credit activity"
                  }
                  description={
                    ar
                        ? "جميع حركات رصيدك."
                        : "Your credit transactions."
                  }
              />

              <div className="mt-4">
                <QueryFeedback query={transactions} />

                {transactions.isPending ? (
                    <PaymentHistorySkeleton />
                ) : transactions.isError ? (
                    <ErrorState
                        error={transactions.error}
                        retry={() =>
                            void transactions.refetch()
                        }
                    />
                ) : !allCreditRows.length ? (
                    <EmptyState
                        title={
                          ar
                              ? "ما فيه حركات رصيد حتى الآن"
                              : "No credit activity yet"
                        }
                        description={
                          ar
                              ? "ستظهر هنا إضافات الكريدت واستخداماته."
                              : "Credit additions and usage will appear here."
                        }
                    />
                ) : (
                    <>
                      <div className="flex flex-col divide-y divide-border/60">
                        {creditRows.map((transaction) => {
                          const positive =
                              transaction.amount > 0;

                          const description =
                              creditDescription(
                                  transaction.description,
                                  ar,
                              );

                          const [arLabel, enLabel] =
                          creditActivityLabels[
                              transaction.type
                              ] ?? [
                            transaction.type,
                            transaction.type,
                          ];

                          return (
                              <article
                                  key={transaction.id}
                                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                            <span
                                className={cn(
                                    "grid size-9 shrink-0 place-items-center rounded-lg",
                                    positive
                                        ? "bg-primary/10 text-primary"
                                        : "bg-secondary text-secondary-foreground",
                                )}
                            >
                              {positive ? (
                                  <ArrowDownLeft className="size-4" />
                              ) : (
                                  <ArrowUpRight className="size-4" />
                              )}
                            </span>

                                  <div className="min-w-0">
                                    <h3 className="text-sm font-medium">
                                      {ar
                                          ? arLabel
                                          : enLabel}
                                    </h3>

                                    {description && (
                                        <p className="mt-1 break-words text-xs text-muted-foreground">
                                          {description}
                                        </p>
                                    )}

                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatTimestamp(
                                          transaction.createdAt,
                                          locale,
                                      )}
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {ar
                                          ? "الرصيد بعد العملية"
                                          : "Balance after"}
                                      :{" "}
                                      {formatCredits(
                                          transaction.balanceAfter,
                                          locale,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <p
                                    className={cn(
                                        "shrink-0 font-semibold tabular-nums",
                                        positive
                                            ? "text-primary"
                                            : "text-foreground",
                                    )}
                                >
                                  {positive ? "+" : ""}
                                  {formatCredits(
                                      transaction.amount,
                                      locale,
                                  )}
                                  <span className="ms-1 text-xs font-normal text-muted-foreground">
                              {ar
                                  ? "كريدت"
                                  : "credits"}
                            </span>
                                </p>
                              </article>
                          );
                        })}
                      </div>

                      <Pagination
                          page={currentCreditPage}
                          total={allCreditRows.length}
                          onChange={setCreditPage}
                          ar={ar}
                      />
                    </>
                )}
              </div>
            </section>

            {/* PAYMENT HISTORY */}
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeader
                  icon={CreditCard}
                  title={
                    ar
                        ? "سجل المدفوعات"
                        : "Payment history"
                  }
                  description={
                    ar
                        ? "تابع عمليات الدفع وحالاتها."
                        : "Review your payment transactions."
                  }
                  action={
                    <Field className="w-44">
                      <FieldLabel
                          htmlFor="payment-filter"
                          className="sr-only"
                      >
                        {copy.paymentStatus}
                      </FieldLabel>

                      <Select
                          items={[
                            {
                              value: "",
                              label: copy.allStatuses,
                            },
                            ...knownPaymentStatuses.map(
                                (value) => ({
                                  value: value.toLowerCase(),
                                  label: statusLabel(
                                      value,
                                      ar,
                                  ),
                                }),
                            ),
                          ]}
                          value={status}
                          onValueChange={(value) => {
                            setStatus(value || "");
                            setPaymentPage(1);
                            setVerified(null);
                            verify.reset();
                          }}
                      >
                        <SelectTrigger
                            id="payment-filter"
                            className="h-10 w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="">
                              {copy.allStatuses}
                            </SelectItem>

                            {knownPaymentStatuses.map(
                                (value) => (
                                    <SelectItem
                                        key={value}
                                        value={value.toLowerCase()}
                                    >
                                      {statusLabel(
                                          value,
                                          ar,
                                      )}
                                    </SelectItem>
                                ),
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  }
              />

              <div className="mt-4">
                <QueryFeedback query={paymentHistory} />

                {paymentHistory.isPending ? (
                    <PaymentHistorySkeleton />
                ) : paymentHistory.isError ? (
                    <ErrorState
                        error={paymentHistory.error}
                        retry={() =>
                            void paymentHistory.refetch()
                        }
                    />
                ) : !allHistoryRows.length ? (
                    <EmptyState
                        title={copy.noPayments}
                        description={copy.noPaymentsHint}
                    />
                ) : (
                    <>
                      <PaymentTable
                          rows={historyRows}
                          packages={packages.data ?? []}
                          locale={locale}
                          onVerify={(id) =>
                              verify.mutate(id)
                          }
                          verifyingId={
                            verify.isPending
                                ? verify.variables
                                : null
                          }
                      />

                      <Pagination
                          page={currentPaymentPage}
                          total={allHistoryRows.length}
                          onChange={setPaymentPage}
                          ar={ar}
                      />
                    </>
                )}

                {verify.isError && (
                    <div className="mt-4">
                      <ErrorState
                          error={verify.error}
                          retry={() => {
                            if (
                                verify.variables != null
                            ) {
                              verify.mutate(
                                  verify.variables,
                              );
                            }
                          }}
                      />
                    </div>
                )}

                {verified && (
                    <p
                        role="status"
                        className="mt-4 rounded-xl border bg-secondary/30 p-3 text-sm"
                    >
                      {ar
                          ? "حالة العملية"
                          : "Payment status"}{" "}
                      #{verified.id}:{" "}
                      {statusLabel(
                          verified.status,
                          ar,
                      )}
                    </p>
                )}
              </div>
            </section>
          </div>

          {/* PURCHASE SIDEBAR */}
          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-5">
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeader
                  icon={CreditCard}
                  title={
                    ar
                        ? "ملخص الشراء"
                        : "Purchase summary"
                  }
                  description={
                    ar
                        ? "راجع باقتك قبل الدفع."
                        : "Review your package before payment."
                  }
              />

              {selectedPackage ? (
                  <dl className="mt-5 flex flex-col gap-3 rounded-2xl bg-secondary/35 p-4 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {ar ? "الباقة" : "Package"}
                      </dt>
                      <dd className="text-end font-medium">
                        {selectedPackage.name}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {ar ? "الكريدت" : "Credits"}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {formatCredits(
                            selectedPackage.credits,
                            locale,
                        )}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-3 border-t pt-3">
                      <dt className="font-medium">
                        {ar
                            ? "المبلغ المستحق"
                            : "Amount due"}
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {formatSar(
                            packagePriceHalalas(
                                selectedPackage,
                            ),
                            locale,
                        )}
                      </dd>
                    </div>
                  </dl>
              ) : (
                  <p className="mt-5 rounded-2xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">
                    {ar
                        ? "اختر باقة لعرض ملخص الشراء."
                        : "Select a package to see your summary."}
                  </p>
              )}

              {!checkout ? (
                  <Button
                      type="button"
                      disabled={
                          !selectedPackage ||
                          createCheckout.isPending ||
                          packages.isPending
                      }
                      onClick={() => {
                        if (selectedPackage) {
                          createCheckout.mutate(
                              selectedPackage,
                          );
                        }
                      }}
                      className="mt-4 min-h-12 w-full rounded-xl"
                  >
                    {createCheckout.isPending
                        ? ar
                            ? "نجهّز الدفع..."
                            : "Preparing payment..."
                        : ar
                            ? "المتابعة إلى الدفع الآمن"
                            : "Continue to secure payment"}
                  </Button>
              ) : (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-background p-4">
                    <div className="flex items-start gap-3">
                      <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">
                          {ar
                              ? "الدفع الآمن"
                              : "Secure payment"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {ar
                              ? "أكمل الدفع عبر ميسّر."
                              : "Complete your payment with Moyasar."}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(
                          checkout.amount,
                          checkout.currency,
                          locale,
                      )}
                    </p>

                    <MoyasarForm checkout={checkout} />
                  </div>
              )}

              {createCheckout.isError && (
                  <div className="mt-4">
                    <ErrorState
                        error={createCheckout.error}
                        retry={() => {
                          if (selectedPackage) {
                            createCheckout.mutate(
                                selectedPackage,
                            );
                          }
                        }}
                        retryDisabled={
                          createCheckout.isPending
                        }
                    />
                  </div>
              )}
            </section>

            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
              <SectionHeader
                  icon={CircleHelp}
                  title={
                    ar
                        ? "معلومات الدفع"
                        : "Payment information"
                  }
              />

              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                {ar
                    ? "تتم معالجة الدفع بأمان عبر ميسّر، ويُضاف الكريدت إلى محفظتك بعد تأكيد العملية."
                    : "Payments are securely processed by Moyasar. Credits are added after payment confirmation."}
              </p>

              <Button
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                  variant="outline"
                  className="mt-5 w-full rounded-xl"
              >
                {ar
                    ? "العودة إلى لوحة التحكم"
                    : "Back to dashboard"}
              </Button>
            </section>
          </aside>
        </div>

        {paymentSuccess && (
            <PaymentSuccessDialog
                ar={ar}
                locale={locale}
                balance={successBalance}
                addedCredits={addedCredits}
                loading={successLoading}
                onClose={() => {
                  setPaymentSuccess(null);
                  setSuccessBalance(null);
                }}
            />
        )}
      </div>
  );
}

/* PAYMENT RETURN */

const subscribe = () => () => {};

export function PaymentReturn() {
  const locale = useLocale();
  const ar = locale === "ar";
  const text = getProductCopy(locale);
  const { userId } = useIdentity();
  const cache = useQueryClient();
  const router = useRouter();

  const refreshed = useRef<string | null>(null);
  const redirected = useRef(false);
  const verificationStartedAt = useRef(Date.now());

  const ready = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
  );

  const localId = useSyncExternalStore(
      subscribe,
      () => {
        try {
          return (
              sessionStorage.getItem("madar-last-payment-id") ||
              sessionStorage.getItem(`madar-payment:${userId}`)
          );
        } catch {
          return null;
        }
      },
      () => null,
  );

  const origin = useSyncExternalStore(
      subscribe,
      () => {
        try {
          return sessionStorage.getItem(
              `madar-payment-origin:${userId}`,
          );
        } catch {
          return null;
        }
      },
      () => null,
  );

  const id =
      localId &&
      /^\d+$/.test(localId) &&
      Number(localId) > 0 &&
      Number(localId) <= 2147483647
          ? Number(localId)
          : null;

  const verification = useQuery({
    queryKey: [
      "payment-verification",
      userId,
      id,
    ],
    queryFn: ({ signal }) =>
        payments.verify(id!, signal),
    enabled: ready && userId != null && id !== null,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      if (
          Date.now() - verificationStartedAt.current >= 60_000
      ) {
        return false;
      }

      if (query.state.status === "error") {
        return false;
      }

      return !query.state.data ||
      query.state.data.status === "PENDING"
          ? 3000
          : false;
    },


  });

  const isCreditPurchase =
      verification.data != null &&
      verification.data.serviceType !==
      "COMMUTE_REPORT";

  const isPaidCreditPurchase =
      isCreditPurchase &&
      verification.data?.status === "PAID";

  const access = useQuery({
    queryKey: [
      "access-after-verify",
      userId,
      verification.dataUpdatedAt,
    ],
    queryFn: ({ signal }) =>
        payments.access(signal),
    enabled:
        verification.data?.serviceType ===
        "COMMUTE_REPORT",
    staleTime: 0,
    retry: false,
  });

  const creditBalance = useQuery({
    queryKey: ["credit-balance", userId],
    queryFn: ({ signal }) =>
        credits.balance(signal),
    enabled: isPaidCreditPurchase,
    staleTime: 0,
    retry: false,
  });

  const creditTransactions = useQuery({
    queryKey: ["credit-transactions", userId],
    queryFn: ({ signal }) =>
        credits.transactions(signal),
    enabled: isPaidCreditPurchase,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    const payment = verification.data;

    if (!payment || verification.isFetching) {
      return;
    }

    const key = `${payment.id}:${payment.status}`;

    if (refreshed.current === key) return;

    refreshed.current = key;

    if (payment.status === "PAID") {
      void Promise.all([
        cache.invalidateQueries({
          queryKey: ["credit-balance", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["credit-transactions", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["payments", userId],
        }),
        cache.invalidateQueries({
          queryKey: ["access", userId],
        }),
      ]);
    }

    if (
        payment.status !== "PENDING" &&
        payment.serviceType !== "COMMUTE_REPORT"
    ) {
      try {
        sessionStorage.removeItem(
            `madar-credit-checkout-key:${userId}:${payment.serviceType}`,
        );
      } catch {
        // Storage may be unavailable.
      }
    }
  }, [
    cache,
    userId,
    verification.data,
    verification.isFetching,
  ]);

  useEffect(() => {
    const payment = verification.data;

    if (
        !payment ||
        payment.status !== "PAID" ||
        payment.serviceType ===
        "COMMUTE_REPORT" ||
        redirected.current
    ) {
      return;
    }

    redirected.current = true;

    try {
      sessionStorage.setItem(
          `madar-payment-success:${userId}`,
          String(payment.id),
      );
    } catch {
      // Navigation still works.
    }

    router.replace("/payments");
  }, [
    verification.data,
    router,
    userId,
  ]);

  let coordinates: {
    latitude: number;
    longitude: number;
  } | null = null;

  try {
    const parsed = JSON.parse(origin || "null");

    if (
        parsed &&
        validCoordinates(
            parsed.latitude,
            parsed.longitude,
        )
    ) {
      coordinates = parsed;
    }
  } catch {
    // Optional return context.
  }

  const statusText = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: text.pending,
      PAID: text.paid,
      FAILED: text.failed,
      REFUNDED: text.refunded,
    };

    return (
        labels[status] ??
        (ar ? "حالة غير معروفة" : "Unknown status")
    );
  };

  const pendingTimedOut =
      verification.data?.status === "PENDING" &&
      Date.now() -
      verificationStartedAt.current >=
      VERIFY_TIMEOUT;

  return (
      <div className="flex max-w-3xl flex-col gap-5">
        <PageHeading
            title={text.paymentReturn}
            description={text.paymentReturnHint}
        />

        {!ready ? (
            <PaymentVerificationSkeleton />
        ) : !id ? (
            <EmptyState
                title={text.noSession}
                description={text.noSessionHint}
            >
              <Button
                  nativeButton={false}
                  render={<Link href="/payments" />}
              >
                {text.paymentHistory}
              </Button>
            </EmptyState>
        ) : verification.isPending ? (
            <PaymentVerificationSkeleton />
        ) : verification.isError ? (
            <ErrorState
                error={verification.error}
                retry={() =>
                    void verification.refetch()
                }
                retryDisabled={
                  verification.isFetching
                }
            />
        ) : (
            <>
              <div
                  role="status"
                  className="rounded-2xl border border-border/70 bg-card p-5"
              >
                <div className="flex items-center gap-3">
                  {verification.data.status ===
                  "PAID" ? (
                      <CheckCircle2 className="size-5 text-primary" />
                  ) : verification.data.status ===
                  "PENDING" ? (
                      <RefreshCw
                          className={cn(
                              "size-5 text-primary",
                              verification.isFetching &&
                              "animate-spin",
                          )}
                      />
                  ) : (
                      <CreditCard className="size-5 text-muted-foreground" />
                  )}

                  <p className="font-medium">
                    {statusText(
                        verification.data.status,
                    )}
                  </p>
                </div>

                {verification.data.status ===
                    "PENDING" && (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {pendingTimedOut
                              ? ar
                                  ? "ما زالت العملية قيد التأكيد. يمكنك العودة للمحفظة ومراجعة حالتها لاحقًا."
                                  : "Payment is still pending. You can check its status later in your wallet."
                              : ar
                                  ? "جارٍ التحقق من الدفع تلقائيًا، يرجى الانتظار."
                                  : "Verifying your payment automatically. Please wait."}
                        </p>
                    )}

                {verification.data.status ===
                    "PAID" &&
                    isCreditPurchase && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {ar
                              ? "تم تأكيد الدفع. جارٍ العودة إلى المحفظة..."
                              : "Payment confirmed. Returning to your wallet..."}
                        </p>
                    )}
              </div>

              {verification.data.status ===
                  "PAID" &&
                  isCreditPurchase && (
                      <section className="rounded-2xl border border-border/70 bg-card p-5">
                        {creditBalance.isPending ? (
                            <SummarySkeleton />
                        ) : creditBalance.isError ? (
                            <ErrorState
                                error={creditBalance.error}
                                retry={() =>
                                    void creditBalance.refetch()
                                }
                            />
                        ) : (
                            <p className="text-lg font-semibold tabular-nums">
                              {ar
                                  ? "الرصيد الحالي"
                                  : "Current balance"}
                              :{" "}
                              {formatCredits(
                                  creditBalance.data.balance,
                                  locale,
                              )}{" "}
                              {ar ? "كريدت" : "credits"}
                            </p>
                        )}

                        {creditTransactions.isError && (
                            <div className="mt-4">
                              <ErrorState
                                  error={
                                    creditTransactions.error
                                  }
                                  retry={() =>
                                      void creditTransactions.refetch()
                                  }
                              />
                            </div>
                        )}
                      </section>
                  )}

              {verification.data.serviceType ===
                  "COMMUTE_REPORT" &&
                  (verification.isFetching ||
                  access.isPending ||
                  access.isFetching ? (
                      <>
                        <p role="status">
                          {text.checkingAccess}
                        </p>
                        <SummarySkeleton />
                      </>
                  ) : access.isError ? (
                      <ErrorState
                          error={access.error}
                          retry={() =>
                              void access.refetch()
                          }
                          retryDisabled={
                            access.isFetching
                          }
                      />
                  ) : access.data?.access ? (
                      <>
                        <p className="text-primary">
                          {text.accessUntil}{" "}
                          <bdi>
                            {formatTimestamp(
                                access.data.expiresAt,
                                locale,
                            )}
                          </bdi>
                          .
                        </p>

                        {coordinates && (
                            <CommutePanel {...coordinates} />
                        )}
                      </>
                  ) : (
                      <p>{text.noAccess}</p>
                  ))}

              <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    disabled={
                      verification.isFetching
                    }
                    onClick={() =>
                        void verification.refetch()
                    }
                >
                  <RefreshCw className="size-4" />
                  {text.verifyAgain}
                </Button>

                <Button
                    nativeButton={false}
                    render={<Link href="/payments" />}
                    variant="outline"
                >
                  {ar
                      ? "العودة للمحفظة"
                      : "Back to wallet"}
                </Button>
              </div>
            </>
        )}
      </div>
  );
}
