import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MadarLogo } from "@/components/branding/madar-logo";
import { cn } from "@/lib/utils";

export function SiteBrand({
                            compact = false,
                            onClick,
                          }: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const common = useTranslations("Common");
  const locale = useLocale();

  return (
      <Link
          href="/"
          onClick={onClick}
          aria-label={common("brand")}
          className={cn(
              "inline-flex items-center rounded-xl",
              compact ? "min-w-0 max-w-full gap-1.5 sm:gap-2" : "shrink-0 gap-2",
          )}
      >
        <MadarLogo
            decorative
            size="lg"
        />

        <span className="flex min-w-0 flex-col gap-1 leading-none">
        <span
            className={cn(
                "font-heading text-xl font-bold sm:text-2xl",
                compact && "truncate",
                locale === "en" && "tracking-[.08em]",
            )}
        >
          {common("brand")}
        </span>
      </span>
      </Link>
  );
}