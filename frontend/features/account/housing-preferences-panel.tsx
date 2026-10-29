
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Pencil,
  UsersRound,
  Wallet,
} from "lucide-react";

import { saveSelectedInterests } from "@/lib/api/lifestyle-interests";
import { QueryFeedback } from "@/components/shared/query-feedback";
import { SummaryPanelSkeleton } from "@/components/shared/page-skeleton";
import { TaskDialog } from "@/components/shared/task-dialog";
import { Button } from "@/components/ui/button";
import {
  housingPreferenceSchema,
  type HousingPreference,
} from "@/lib/api/contracts";
import { preferencesApi } from "@/lib/api/preferences";
import { invalidateUserData } from "@/features/account/api/invalidation";
import { useHousing } from "@/features/account/api/query-hooks";
import { useIdentity } from "@/features/account/identity";
import {
  DataForm,
  type FormField,
} from "@/components/forms/data-form";
import { DeleteAction } from "@/components/shared/delete-action";
import { ErrorState } from "@/components/shared/error-state";
import { CategorySelector } from "@/features/account/category-selector";
import { ChoiceCards } from "@/components/forms/choice-cards";
import {
  HousingCityField,
  HousingDistrictField,
  HousingRegionField,
} from "./location-fields";

const housingFormSchema = housingPreferenceSchema.extend({
  interests: z.array(z.string().min(1)),
});

function DetailItem({
                      icon: Icon,
                      label,
                      value,
                    }: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
      <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/50 bg-secondary/20 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary">
        <Icon className="size-4" />
      </span>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-semibold">
            {value}
          </p>
        </div>
      </div>
  );
}

export function HousingPanel() {
  const ar = useLocale() === "ar";
  const t = useTranslations("Workspace");
  const { userId } = useIdentity();
  const query = useHousing(userId);
  const cache = useQueryClient();

  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] =
      useState<HousingPreference | null>(null);
  const [busy, setBusy] = useState(false);

  if (query.isPending) return <SummaryPanelSkeleton />;

  if (query.isError && !query.data) {
    return (
        <ErrorState
            error={query.error}
            retry={() => void query.refetch()}
        />
    );
  }

  const pref = query.data;

  const types = [
    { value: "apartment", label: ar ? "شقة" : "Apartment" },
    { value: "villa", label: ar ? "فيلا" : "Villa" },
    { value: "floor", label: ar ? "دور" : "Floor" },
    { value: "duplex", label: ar ? "دوبلكس" : "Duplex" },
    { value: "building", label: ar ? "عمارة" : "Building" },
  ];

  const fields: FormField[] = [
    {
      name: "listingType",
      options: [
        { value: "rent", label: t("rent") },
        { value: "sale", label: t("sale") },
      ],
      control: "choices",
      fullWidth: true,
    },
    {
      name: "propertyType",
      options: types,
      control: "choices",
      fullWidth: true,
    },
    {
      name: "city",
      render: (props) => <HousingCityField {...props} />,
    },
    {
      name: "region",
      maxLength: 100,
      render: (props) => <HousingRegionField {...props} />,
    },
    {
      name: "maxBudget",
      type: "number",
      min: 1,
      unit: "SAR",
      description: ar
          ? "للإيجار: الميزانية السنوية. للبيع: السعر الإجمالي."
          : "Rent: annual budget. Purchase: total price.",
    },
    {
      name: "occupantsCount",
      control: "stepper",
      type: "number",
      min: 1,
      max: 2147483647,
    },
    {
      name: "includeNearbyServices",
      label: ar
          ? "احتساب الخدمات القريبة"
          : "Include nearby services",
      fullWidth: true,
      advanced: true,
      render: (props) => (
          <ChoiceCards
              {...props}
              value={props.value === false ? "false" : "true"}
              options={[
                {
                  value: "true",
                  label: ar ? "نعم، احتسبها" : "Yes, include them",
                },
                {
                  value: "false",
                  label: ar ? "لا، بدون الخدمات" : "No, exclude them",
                },
              ]}
              onChange={(value) =>
                  props.onChange(value === "true")
              }
          />
      ),
    },
    {
      name: "district",
      required: false,
      advanced: true,
      fullWidth: true,
      render: (props) => <HousingDistrictField {...props} />,
    },
    {
      name: "interests",
      label: ar
          ? "الخدمات التي تهمك"
          : "Services that matter",
      required: false,
      advanced: true,
      fullWidth: true,
      render: (props) => (
          <CategorySelector
              lifestyle
              value={
                Array.isArray(props.value)
                    ? props.value
                    : []
              }
              onChange={props.onChange}
          />
      ),
    },
  ];

  const propertyTypeLabel = pref
      ? types.find((type) => type.value === pref.propertyType)
      ?.label || pref.propertyType
      : "";

  const listingTypeLabel = pref
      ? t(pref.listingType)
      : "";

  const formattedBudget = pref
      ? new Intl.NumberFormat(ar ? "ar-SA" : "en-SA", {
        style: "currency",
        currency: "SAR",
        maximumFractionDigits: 0,
      }).format(pref.maxBudget)
      : "";

  const openEditor = () => {
    setSnapshot(pref || null);
    setOpen(true);
  };

  return (
      <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
        <div className="p-5 sm:p-7">
          <QueryFeedback query={query} />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>

              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {t("housingPreferences")}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  {ar
                      ? "كل التفاصيل اللي تساعد مدار يلقى لك السكن الأنسب."
                      : "The details that help Madar find your ideal home."}
                </p>
              </div>
            </div>

            <Button
                type="button"
                variant={pref ? "outline" : "default"}
                onClick={openEditor}
                className="min-h-10 gap-2 rounded-xl"
            >
              {pref ? (
                  <Pencil className="size-4" />
              ) : (
                  <Building2 className="size-4" />
              )}
              {pref
                  ? t("edit")
                  : ar
                      ? "إعداد التفضيلات"
                      : "Set preferences"}
            </Button>
          </div>

          {pref ? (
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                <CheckCircle2 className="size-3.5" />
                {ar
                    ? "تفضيلاتك محفوظة"
                    : "Preferences saved"}
              </span>
                  <span className="text-xs text-muted-foreground">
                {ar
                    ? "تقدرين تعدلينها في أي وقت"
                    : "You can update them anytime"}
              </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailItem
                      icon={Building2}
                      label={ar ? "نوع السكن" : "Property type"}
                      value={`${propertyTypeLabel} · ${listingTypeLabel}`}
                  />

                  <DetailItem
                      icon={MapPin}
                      label={ar ? "الموقع" : "Location"}
                      value={[
                        pref.city,
                        pref.district,
                      ]
                          .filter(Boolean)
                          .join("، ")}
                  />

                  <DetailItem
                      icon={Wallet}
                      label={
                        ar
                            ? "الميزانية"
                            : "Budget"
                      }
                      value={`${formattedBudget}${
                          pref.listingType === "rent"
                              ? ar
                                  ? " سنويًا"
                                  : " per year"
                              : ""
                      }`}
                  />

                  <DetailItem
                      icon={UsersRound}
                      label={
                        ar
                            ? "عدد السكان"
                            : "Occupants"
                      }
                      value={
                        pref.occupantsCount != null
                            ? String(pref.occupantsCount)
                            : ar
                                ? "غير محدد"
                                : "Not specified"
                      }
                  />
                </div>
              </div>
          ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-background text-primary">
              <Building2 className="size-6" />
            </span>
                <h3 className="mt-4 text-base font-semibold">
                  {ar
                      ? "خلّينا نعرف وش يناسبك"
                      : "Let's find what suits you"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                  {ar
                      ? "حددي نوع السكن والمدينة والميزانية، ومدار يساعدك تلقين الخيارات المناسبة."
                      : "Choose your property type, city and budget to find suitable options."}
                </p>
                <Button
                    type="button"
                    onClick={openEditor}
                    className="mt-5 min-h-11 rounded-xl px-6"
                >
                  {ar
                      ? "إعداد تفضيلات السكن"
                      : "Set housing preferences"}
                </Button>
              </div>
          )}
        </div>

        <TaskDialog
            open={open}
            onOpenChange={setOpen}
            busy={busy}
            title={t("housingPreferences")}
            description={
              ar
                  ? "اختياراتك الحالية محفوظة ويمكن تعديلها متى رغبت."
                  : "Your current choices are saved and can be updated anytime."
            }
        >
          <DataForm
              schema={housingFormSchema}
              defaults={
                snapshot
                    ? {
                      region: snapshot.region,
                      city: snapshot.city,
                      district: snapshot.district ?? "",
                      maxBudget: snapshot.maxBudget,
                      occupantsCount:
                          snapshot.occupantsCount ?? "",
                      propertyType: snapshot.propertyType,
                      listingType: snapshot.listingType,
                      includeNearbyServices:
                          snapshot.includeNearbyServices ?? true,
                      interests: snapshot.interests,
                    }
                    : {
                      region: "",
                      city: "",
                      district: "",
                      maxBudget: "",
                      occupantsCount: "",
                      includeNearbyServices: true,
                      interests: [],
                      propertyType: "",
                      listingType: "rent",
                    }
              }
              fields={fields}
              onCancel={() => setOpen(false)}
              onSubmit={async (value) => {
                setBusy(true);

                try {
                  const body = housingPreferenceSchema.parse(value);

                  if (snapshot?.id) {
                    await preferencesApi.update(snapshot.id, body);
                  } else {
                    await preferencesApi.add(body);
                  }

                  if (
                      JSON.stringify([...value.interests].sort()) !==
                      JSON.stringify(
                          [...(snapshot?.interests ?? [])].sort(),
                      )
                  ) {
                    await saveSelectedInterests(value.interests);
                  }

                  setOpen(false);
                } finally {
                  await invalidateUserData(cache, userId);
                  setBusy(false);
                }
              }}
          />

          {snapshot?.id ? (
              <div className="border-t border-border/60 pt-4">
                <DeleteAction
                    onDelete={async () => {
                      await preferencesApi.remove(snapshot.id!);
                      await invalidateUserData(cache, userId);
                      setOpen(false);
                    }}
                />
              </div>
          ) : null}
        </TaskDialog>
      </section>
  );
}
