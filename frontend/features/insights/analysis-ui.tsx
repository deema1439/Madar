"use client";
import { getProductCopy } from "@/messages/product-copy";
import { useId } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { weightsSchema, type RecommendationWeights } from "@/lib/api/insight-contracts";

export function ScoreFacts({
  match,
  housing,
  commute,
  services,
}: {
  match?: number | null;
  housing?: number | null;
  commute: number | null;
  services?: number | null;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const facts = [
    [ar ? "المطابقة" : "Match", match],
    [ar ? "السكن" : "Housing", housing],
    [ar ? "التنقل" : "Commute", commute],
    [ar ? "الخدمات" : "Services", services],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {facts
        .filter(([, value]) => value !== undefined)
        .map(([label, value]) => (
          <div
            key={label}
            className="border-s-2 border-border/70 ps-3 py-1"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums">
              {value == null || !Number.isFinite(value)
                ? ar
                  ? "غير متاح"
                  : "Unavailable"
                  : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function WeightsControl({
  value,
  onChange,
}: {
  value: RecommendationWeights | null;
  onChange: (weights: RecommendationWeights | null) => void;
}) {
  const text = getProductCopy(useLocale());
  const id = useId();
  return (
    <details className="rounded-xl bg-secondary/30 p-4">
      <summary className="cursor-pointer text-sm">{text.weights}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{text.weightsHint}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange(
              value ? null : { housingWeight: 40, commuteWeight: 40, servicesWeight: 20 },
            )
          }
        >
          {value ? text.defaultWeights : text.customWeights}
        </Button>
        {value ? (
          <>
            <FieldGroup className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["housingWeight", text.housing],
                  ["commuteWeight", text.commute],
                  ["servicesWeight", text.services],
                ] as const
              ).map(([name, label]) => (
                <Field key={name}>
                  <FieldLabel htmlFor={`${id}-${name}`}>{label} (%)</FieldLabel>
                  <Input
                    id={`${id}-${name}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={Number.isNaN(value[name]) ? "" : value[name]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [name]: e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              ))}
            </FieldGroup>
            {!weightsSchema.safeParse(value).success ? (
              <p
                role="alert"
                className="text-xs text-destructive"
              >
                {text.invalidWeights}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
/** Restricted Markdown subset: React escapes all text; raw HTML and links never execute. */
export function SafeMarkdown({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong
          key={i}
          className="font-semibold"
        >
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      ),
    );
  return (
    <div
      dir="auto"
      className="flex min-w-0 flex-col gap-2 break-words text-start text-sm leading-7 [overflow-wrap:anywhere]"
    >
      {text
        .split(/\n+/)
        .filter(Boolean)
        .map((line, i) =>
          /^\s*[-*]\s+/.test(line) ? (
            <p
              key={i}
              className="ps-3"
            >
              • {inline(line.replace(/^\s*[-*]\s+/, ""))}
            </p>
          ) : (
            <p key={i}>{inline(line)}</p>
          ),
        )}
    </div>
  );
}
