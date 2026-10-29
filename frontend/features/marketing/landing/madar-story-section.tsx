"use client";

import Image from "next/image";
import {
  ArrowUpLeft,
  BriefcaseBusiness,
  Heart,
  House,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { displayHeadingVariants } from "@/components/typography/display-heading";
import { cn } from "@/lib/utils";

const markerDrifts = {
  home: {
    x: [0, 4, 6, 2, 0],
    y: [0, -4, -1, 3, 0],
    duration: 11,
    delay: 0,
  },
  work: {
    x: [0, -3, -6, -2, 0],
    y: [0, 3, 0, -4, 0],
    duration: 12.5,
    delay: 0.8,
  },
  interests: {
    x: [0, 3, -2, -5, 0],
    y: [0, -2, -5, 1, 0],
    duration: 10.5,
    delay: 1.6,
  },
};

const entranceEase = [0.22, 1, 0.36, 1] as const;

type MarkerDrift = {
  x: number[];
  y: number[];
  duration: number;
  delay: number;
};

type StoryContextMarkerProps = {
  icon: LucideIcon;
  label: string;
  className: string;
  drift: MarkerDrift;
  entranceDelay: number;
  reducedMotion: boolean;
};

export function MadarStorySection() {
  const t = useTranslations("Hero");
  const reducedMotion = Boolean(useReducedMotion());
  const titleLines = t("storyTitle").split("\n");

  return (
      <section
          id="story"
          className="relative isolate scroll-mt-24 overflow-hidden bg-[#1C2D47] pb-10 pt-52 text-white sm:pb-12 sm:pt-56 lg:pb-14 lg:pt-60"
      >
      {/* Ambient background effects */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className={cn(
            "absolute -top-40 start-1/2 size-[35rem]",
            "-translate-x-1/2 rounded-full blur-3xl",
            "bg-white/5",
          )}
        />

        <div
          className={cn(
            "absolute -bottom-60 start-0 size-[30rem]",
            "rounded-full blur-3xl",
            "bg-[#7396C2]/10",
          )}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        {/* Story heading */}
        <div className="mx-auto max-w-5xl text-center">
          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.4, ease: entranceEase }}
            className="text-sm font-medium text-[#D6E2F2] motion-reduce:!transform-none motion-reduce:!opacity-100 sm:text-base"
          >
            {t("storyEyebrow")}
          </motion.p>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.6,
              delay: reducedMotion ? 0 : 0.08,
              ease: entranceEase,
            }}
            className={cn(
              displayHeadingVariants({ variant: "hero" }),
              "mx-auto mt-3 max-w-4xl text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.18] ltr:tracking-tight motion-reduce:!transform-none motion-reduce:!opacity-100",
            )}
          >
            {titleLines.map((line) => (
              <span
                key={line}
                className="block"
              >
                {line}
              </span>
            ))}
          </motion.h1>

          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.2,
              ease: entranceEase,
            }}
            className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#E3EAF4] motion-reduce:!transform-none motion-reduce:!opacity-100 sm:mt-5 sm:text-lg sm:leading-8"
          >
            {t("storyDescription")}
          </motion.p>
        </div>

        {/* Avatar composition */}
        <div className="relative mx-auto mt-5 flex h-56 max-w-3xl items-center justify-center sm:mt-6 sm:h-72 lg:h-[20rem]">
          {/* Ambient glow behind avatar */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute",
              "bottom-[12%] size-56 rounded-full",
              "bg-[#7396C2]/10 blur-3xl",
              "sm:size-72 lg:size-96",
            )}
          />

          {/* Ground shadow */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-4",
              "h-12 w-3/5 rounded-full",
              "bg-black/30 blur-2xl",
            )}
          />

          {/* Madar character */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reducedMotion ? 0 : 0.65,
              delay: reducedMotion ? 0 : 0.25,
              ease: entranceEase,
            }}
            className="relative z-10 motion-reduce:!transform-none motion-reduce:!opacity-100"
          >
            <motion.div
              initial={false}
              animate={reducedMotion ? { y: 0 } : { y: [0, -5, 0] }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 8, delay: 1, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <Image
                src="/images/about/madar-character.png"
                alt={t("avatarAlt")}
                width={587}
                height={603}
                sizes="(min-width: 1024px) 304px, (min-width: 640px) 256px, 208px"
                preload
                className="h-auto w-52 drop-shadow-[0_18px_24px_rgba(0,0,0,0.25)] sm:w-64 lg:w-[19rem]"
              />
            </motion.div>
          </motion.div>

          {/* Home marker */}
          <StoryContextMarker
            icon={House}
            label={t("contextHome")}
            className={cn(
              "start-0 top-[10%] -rotate-6",
              "sm:start-[10%]",
              "lg:start-[14%]",
            )}
            drift={markerDrifts.home}
            entranceDelay={0.42}
            reducedMotion={reducedMotion}
          />

          {/* Work marker */}
          <StoryContextMarker
            icon={BriefcaseBusiness}
            label={t("contextWork")}
            className={cn("end-0 top-[32%] rotate-6", "sm:end-[10%]", "lg:end-[14%]")}
            drift={markerDrifts.work}
            entranceDelay={0.52}
            reducedMotion={reducedMotion}
          />

          {/* Interests marker */}
          <StoryContextMarker
            icon={Heart}
            label={t("contextInterests")}
            className={cn(
              "start-0 top-[66%] -rotate-3",
              "sm:start-[12%]",
              "lg:start-[18%]",
            )}
            drift={markerDrifts.interests}
            entranceDelay={0.62}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Story CTA */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reducedMotion ? 0 : 0.45,
            delay: reducedMotion ? 0 : 0.65,
            ease: entranceEase,
          }}
          className="mt-5 text-center motion-reduce:!transform-none motion-reduce:!opacity-100 sm:mt-6"
        >
          <Button
            nativeButton={false}
            render={<Link href="/about" />}
            size="lg"
            className={cn(
              "group rounded-full px-7",
              "border border-white/20",
              "bg-white text-[#1C2D47]",
              "shadow-[0_8px_30px_rgba(0,0,0,0.15)]",
              "hover:-translate-y-0.5 hover:bg-[#EAF0F8]",
              "transition-all duration-300",
              "motion-reduce:transform-none",
            )}
          >
            {t("storyLink")}

            <ArrowUpLeft
              aria-hidden="true"
              data-icon="inline-end"
              className={cn(
                "rtl:-scale-x-100",
                "transition-transform duration-300",
                "group-hover:-translate-x-0.5",
                "motion-reduce:transform-none",
              )}
            />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

function StoryContextMarker({
  icon: Icon,
  label,
  className,
  drift,
  entranceDelay,
  reducedMotion,
}: StoryContextMarkerProps) {
  return (
    <motion.span
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.4,
        delay: reducedMotion ? 0 : entranceDelay,
        ease: entranceEase,
      }}
      className={cn(
        "pointer-events-none absolute z-20 motion-reduce:!transform-none motion-reduce:!opacity-100",
        className,
      )}
    >
      <motion.span
        initial={false}
        animate={
          reducedMotion
            ? { x: 0, y: 0 }
            : {
                x: drift.x,
                y: drift.y,
              }
        }
        transition={
          reducedMotion
            ? { duration: 0 }
            : {
                duration: drift.duration,
                delay: drift.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        className={cn(
          "inline-flex items-center gap-1.5",
          "whitespace-nowrap rounded-full",
          "px-2 py-1 sm:px-3 sm:py-1.5",
          "text-[10px] font-medium sm:text-xs",
          "border border-white/20",
          "bg-white/95 text-[#1C2D47]",
          "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
          "backdrop-blur-sm",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn("size-3.5", "text-[#405A80]")}
        />

        {label}
      </motion.span>
    </motion.span>
  );
}
