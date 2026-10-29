"use client";
import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Checkout } from "@/lib/api/discovery-contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingStatus } from "@/components/shared/loading-status";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type MoyasarConfig = {
  element: string;
  amount: number;
  currency: string;
  description: string;
  publishable_api_key: string;
  callback_url: string;
  methods: string[];
  given_id: string;
  metadata: Record<string, string>;
  use_payment_intent: boolean;
  payment_intent: { id: string; client_secret: string };
  language: string;
  on_completed: () => Promise<void>;
  on_failure: () => Promise<void>;
};
declare global {
  interface Window {
    Moyasar?: { init: (options: MoyasarConfig) => void };
  }
}
export function MoyasarForm({ checkout }: { checkout: Checkout }) {
  const locale = useLocale();
  const id = `moyasar-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const t = useTranslations("PaymentForm");
  const root = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const key = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY;
  console.log("Moyasar configuration:", {
    exists: Boolean(key),
    validPrefix: key?.startsWith("pk_"),
    length: key?.length ?? 0,
  });

  useEffect(() => {
    if (!loaded || !root.current || !key?.startsWith("pk_")) return;
    const element = root.current;
    // Initialize the DOM-based provider after its container is laid out; cancel
    // pending initialization on navigation or Strict Mode effect cleanup.
    const frame = requestAnimationFrame(() => {
      if (!window.Moyasar) {
        setFailed(true);
        return;
      }
      try {
        window.Moyasar.init({
          element: `#${id}`,
          amount: checkout.amount,
          currency: checkout.currency,
          description: `MADAR ${checkout.serviceType}`,
          publishable_api_key: key,
          callback_url: `${window.location.origin}/${locale}/payments?payment_return=1`,
          methods: ["creditcard"],
          given_id: checkout.givenId,
          metadata: checkout.metadata,
          use_payment_intent: true,
          payment_intent: { id: checkout.intentId, client_secret: checkout.clientSecret },
          language: locale,
          on_completed: async () => setSubmitted(true),
          on_failure: async () => setFailed(true),
        });
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      element.replaceChildren();
    };
  }, [loaded, checkout, id, key, locale]);
  if (!key?.startsWith("pk_"))
    return (
      <p
        role="status"
        className="text-sm text-muted-foreground"
      >
        {t("unavailable")}
      </p>
    );
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/moyasar-payment-form@2.3.0/dist/moyasar.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/moyasar-payment-form@2.3.0/dist/moyasar.umd.min.js"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && !failed ? (
        <LoadingStatus label={t("loading")}>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-11 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </LoadingStatus>
      ) : null}
      {failed ? (
        <div
          role="alert"
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-destructive">{t("failed")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/payments" />}
            >
              {t("checkHistory")}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              {t("reload")}
            </Button>
          </div>
        </div>
      ) : null}
      {submitted ? <p role="status">{t("submitted")}</p> : null}
      <div
        id={id}
        ref={root}
        hidden={submitted}
        className="[&_input]:font-sans [&_input]:bg-background! [&_input]:text-foreground! [&_input:focus]:border-ring! [&_label]:text-foreground! [&_button]:font-sans [&_button[type=submit]]:rounded-xl! [&_button[type=submit]]:bg-primary! [&_button[type=submit]]:text-primary-foreground!"
      />
      <p className="text-xs leading-6 text-muted-foreground">{t("securityNote")}</p>
    </div>
  );
}
