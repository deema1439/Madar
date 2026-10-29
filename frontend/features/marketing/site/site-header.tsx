
"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Bookmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { usePrefetchLocations } from "@/features/locations/use-prefetch-locations";
import {
  useSafeSession,
  useSessionResolved,
} from "@/features/account/session-hooks";
import { useProfile } from "@/features/account/api/query-hooks";
import { useAccountLogout } from "@/features/account/use-account-logout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  HeaderAccountMenu,
  type HeaderAccountLink,
} from "./header-account-menu";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SiteBrand } from "./site-brand";
import { getLayoutCopy } from "@/messages/layout-copy";
import { NotificationBell } from "@/features/workspace/notification-bell";

type RouteLinkProps = Omit<
    ComponentProps<typeof Link>,
    "aria-current"
>;

function ActiveRouteLink(props: RouteLinkProps) {
  const path = usePathname();

  return (
      <Link
          {...props}
          aria-current={path === props.href ? "page" : undefined}
      />
  );
}

function RouteLink(props: RouteLinkProps) {
  return (
      <Suspense fallback={<Link {...props} />}>
        <ActiveRouteLink {...props} />
      </Suspense>
  );
}

export function SiteHeader() {
  const t = useTranslations("Navigation");
  const common = useTranslations("Common");
  const auth = useTranslations("Auth");

  const locale = useLocale();
  const copy = getLayoutCopy(locale);

  const session = useSafeSession();
  const sessionResolved = useSessionResolved();
  const profile = useProfile(session?.userId ?? null);

  const name =
      session && profile.data?.id === session.userId
          ? profile.data?.fullName
          : undefined;

  const {
    logout,
    signingOut,
    error: logoutError,
  } = useAccountLogout();

  const prefetchLocations = usePrefetchLocations();

  const [open, setOpen] = useState(false);
  const header = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (logoutError) {
      toast.error(t("logoutFailed"));
    }
  }, [logoutError, t]);

  useEffect(() => {
    if (!open) return;

    const outside = (event: PointerEvent) => {
      if (
          event.target instanceof Node &&
          !header.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const close = () => setOpen(false);

  const signOut = () => {
    close();
    void logout();
  };

  const accountLinks: HeaderAccountLink[] = [
    {
      href: "/dashboard",
      label: t("dashboard"),
      icon: LayoutDashboard,
    },
    {
      href: "/profile",
      label: t("myAccount"),
      icon: UserRound,
    },
    {
      href: "/saved",
      label: t("savedProperties"),
      icon: Bookmark,
    },
  ];

  if (session?.role === "ADMIN") {
    accountLinks.push({
      href: "/admin",
      label: auth("admin"),
      icon: Shield,
    });
  }

  const intent = {
    onPointerEnter: prefetchLocations,
    onFocus: prefetchLocations,
    onTouchStart: prefetchLocations,
  };

  const navLinkClass =
      "rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground";

  const mobileLinkClass =
      "flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-sm wrap-break-word hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-secondary aria-[current=page]:font-semibold";

  return (
      <header className="sticky top-3 z-40 mt-3 w-full min-w-0 px-3 sm:top-5 sm:mt-5 sm:px-6">
        <Collapsible
            ref={header}
            open={open}
            onOpenChange={setOpen}
            className="mx-auto w-full min-w-0 max-w-7xl rounded-3xl border border-border/70 bg-card/95 shadow-sm backdrop-blur-md"
        >
          <div className="flex h-16 min-w-0 items-center justify-between gap-3 px-3 sm:h-18 sm:px-6">
            {/* Brand */}
            <div className="min-w-0 flex-1 xl:flex-none">
              <SiteBrand compact onClick={close} />
            </div>

            {/* Desktop navigation */}
            <nav
                aria-label={t("home")}
                className="hidden min-w-0 items-center gap-1 xl:flex"
            >
              <RouteLink
                  href="/about"
                  className="rounded-xl bg-[#444F6D] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#35415F] hover:text-white focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("about")}
              </RouteLink>

              <Link
                  href="/#how-it-works"
                  className={navLinkClass}
              >
                {t("howItWorks")}
              </Link>

              <RouteLink
                  href="/properties"
                  {...intent}
                  className={navLinkClass}
              >
                {locale === "ar"
                    ? "اكتشف بيتك القادم"
                    : "Find your next home"}
              </RouteLink>
            </nav>

            {/* Desktop account and preferences */}
            <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
              <LanguageSwitcher />
              <ThemeToggle />

              {!sessionResolved ? (
                  <Skeleton
                      className="h-11 w-44 rounded-xl"
                      aria-label={t("accountLoading")}
                      role="status"
                  />
              ) : session ? (
                  <>
                    <NotificationBell />

                    <RouteLink
                        href="/dashboard"
                        onClick={close}
                        className="flex min-h-11 min-w-0 items-center rounded-xl px-3 py-2 text-sm wrap-break-word hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold"
                    >
                      <span>{t("myDashboard")}</span>
                    </RouteLink>

                    <Button
                        size="icon-lg"
                        className="size-10 rounded-full"
                        variant="destructive"
                        disabled={signingOut}
                        onClick={signOut}
                        aria-label={
                          signingOut ? t("signingOut") : t("logout")
                        }
                    >
                      <LogOut
                          aria-hidden="true"
                          className="size-4"
                      />
                    </Button>
                  </>
              ) : (
                  <RouteLink
                      href="/login"
                      className={buttonVariants({
                        variant: "outline",
                      })}
                  >
                    {t("login")}
                  </RouteLink>
              )}
            </div>

            {/* Mobile controls */}
            <div className="flex shrink-0 items-center gap-1 xl:hidden">
              {!sessionResolved ? (
                  <Skeleton
                      className="size-11 rounded-full"
                      aria-label={t("accountLoading")}
                      role="status"
                  />
              ) : session ? (
                  <>
                    <NotificationBell />

                    <HeaderAccountMenu
                        name={name}
                        email={session.email}
                        links={accountLinks}
                        signingOut={signingOut}
                        onLogout={signOut}
                    />
                  </>
              ) : null}

              <CollapsibleTrigger
                  render={
                    <Button
                        ref={trigger}
                        variant="ghost"
                        size="icon-lg"
                        className="shrink-0"
                        aria-label={
                          open ? t("closeMenu") : t("openMenu")
                        }
                    />
                  }
              >
                {open ? <X /> : <Menu />}
              </CollapsibleTrigger>
            </div>
          </div>

          {/* Mobile navigation */}
          <CollapsibleContent className="h-(--collapsible-panel-height) w-full min-w-0 overflow-hidden transition-[height,opacity] duration-150 data-ending-style:h-0 data-starting-style:h-0 data-ending-style:opacity-0 data-starting-style:opacity-0 2xl:hidden motion-reduce:transition-none">
            <div className="max-h-[calc(100svh-7rem)] min-w-0 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-6">
              <nav
                  aria-label={copy.mobileMenu}
                  className="flex min-w-0 flex-col gap-1"
              >
                <RouteLink
                    href="/about"
                    onClick={close}
                    className={mobileLinkClass}
                >
                  {t("about")}
                </RouteLink>

                <Link
                    href="/#how-it-works"
                    onClick={close}
                    className={mobileLinkClass}
                >
                  {t("howItWorks")}
                </Link>

                <RouteLink
                    href="/properties"
                    {...intent}
                    onClick={close}
                    className={mobileLinkClass}
                >
                  {locale === "ar"
                      ? "اكتشف بيتك القادم"
                      : "Find your next home"}
                </RouteLink>
              </nav>

              {/* Mobile account */}
              {!sessionResolved ? (
                  <Skeleton
                      className="mt-3 h-11 w-full rounded-xl"
                      aria-label={t("accountLoading")}
                      role="status"
                  />
              ) : session ? (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="min-w-0 px-3 pb-2 text-sm font-medium text-foreground">
                      {name || t("account")}{" "}
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                    <bdi>{session.email}</bdi>
                  </span>
                    </p>

                    {accountLinks.map(
                        ({ href, label, icon: Icon }) => (
                            <RouteLink
                                key={href}
                                href={href}
                                onClick={close}
                                className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm wrap-break-word hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <Icon
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                              />
                              {label}
                            </RouteLink>
                        ),
                    )}

                    <Button
                        variant="ghost"
                        disabled={signingOut}
                        onClick={signOut}
                        className="mt-1 min-h-11 w-full justify-start gap-3 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <LogOut
                          aria-hidden="true"
                          className="size-4"
                      />
                      {signingOut
                          ? t("signingOut")
                          : t("logout")}
                    </Button>
                  </div>
              ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                    <RouteLink
                        href="/login"
                        onClick={close}
                        className={buttonVariants({
                          variant: "outline",
                          className:
                              "h-auto min-h-11 min-w-0 whitespace-normal",
                        })}
                    >
                      {t("login")}
                    </RouteLink>
                  </div>
              )}

              {/* Mobile preferences */}
              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </header>
  );
}
