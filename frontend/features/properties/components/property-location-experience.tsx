"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { MapPin, Route, MapPinned, House, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MadarMap } from "@/components/maps/madar-map";
import { validCoordinates, type MapPoint } from "@/lib/maps/points";
import { NearbyServices } from "@/features/properties/components/nearby-services";
import { CommutePanel } from "@/features/payments/commute-panel";
import { NeighborhoodAnalysisPanel } from "@/features/neighborhood/neighborhood-analysis";
import { PersonalPropertyInsights } from "@/features/properties/components/personal-property-insights";
import { MapNearbyServices } from "@/features/properties/map-nearby-services";

type View = "map" | "services" | "commute" | "analysis" | "home";

export function PropertyLocationExperience({
                                             point,
                                             propertyReference,
                                           }: {
  point: MapPoint;
  propertyReference?: { source: string; externalId: string };
}) {
  const ar = useLocale() === "ar";
  const [view, setView] = useState<View>("map");

  const located = validCoordinates(point.latitude, point.longitude);

  const options = [
    {
      id: "map" as View,
      label: ar ? "الخريطة والخدمات" : "Map and services",
      icon: MapPin,
      disabled: false,
    },
    {
      id: "commute" as View,
      label: ar ? "تحليل التنقل" : "Commute analysis",
      icon: Route,
      disabled: !located,
    },
    {
      id: "analysis" as View,
      label: ar ? "تقييم الموقع والأحياء" : "Location and neighborhoods",
      icon: MapPinned,
      disabled: !located,
    },
    ...(propertyReference
        ? [
          {
            id: "home" as View,
            label: ar ? "الميزانية والمطابقة" : "Budget and match",
            icon: House,
            disabled: false,
          },
        ]
        : []),
    {
      id: "services" as View,
      label: ar ? "قائمة الخدمات القريبة" : "Nearby services",
      icon: ListFilter,
      disabled: !located,
    },
  ];

  return (
      <section
          className="flex min-w-0 flex-col gap-6"
          aria-label={ar ? "الموقع والحياة اليومية" : "Location and daily life"}
      >
        {/* Section heading */}
        <div className="space-y-2">
          <h2 className="text-section font-semibold tracking-tight">
            {ar ? "موقع البيت ومحيطه" : "Home location and surroundings"}
          </h2>

          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {ar
                ? "تعرّف على المنطقة حول البيت، واستكشف الخدمات والمشاوير ومدى مناسبة الموقع لك."
                : "Explore the neighborhood, nearby services, commute options, and how well the location suits you."}
          </p>
        </div>

        {/* Unified navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-5">
          {options.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;

            return (
                <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "outline"}
                    disabled={option.disabled}
                    aria-pressed={active}
                    onClick={() => setView(option.id)}
                    className={`rounded-full px-4 ${
                        active ? "font-semibold" : "font-medium"
                    }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {option.label}
                </Button>
            );
          })}
        </div>

        {/* Active content */}
        <div className="min-w-0">
          {view === "map" ? (
              located ? (
                  <MapNearbyServices property={point} />
              ) : (
                  <MadarMap
                      label={ar ? "موقع البيت" : "Home location"}
                      points={[point]}
                  />
              )
          ) : view === "home" && propertyReference ? (
              <PersonalPropertyInsights {...propertyReference} />
          ) : located ? (
              view === "commute" ? (
                  <CommutePanel
                      latitude={point.latitude!}
                      longitude={point.longitude!}
                  />
              ) : view === "analysis" ? (
                  <NeighborhoodAnalysisPanel
                      initial={{
                        latitude: point.latitude!,
                        longitude: point.longitude!,
                      }}
                  />
              ) : view === "services" ? (
                  <NearbyServices
                      latitude={point.latitude!}
                      longitude={point.longitude!}
                  />
              ) : null
          ) : (
              <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
                {ar
                    ? "موقع هذا البيت غير متاح، لذلك ما نقدر نعرض الخدمات أو نحسب المشاوير."
                    : "This home has no valid location, so services and commute times are unavailable."}
              </p>
          )}
        </div>
      </section>
  );
}