
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, SlidersHorizontal, UserRound } from "lucide-react";

import { ChangePasswordForm } from "@/features/auth/change-password-form";
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/ui/tabs";
import { profileApi } from "@/lib/api/account";
import { useIdentity } from "@/features/account/identity";
import { DeleteAction } from "@/components/shared/delete-action";
import { Panel } from "@/components/shared/panel";
import { PageHeading } from "@/components/shared/page-heading";
import { ProfileCompletionPanel } from "./profile-completion";
import { HomePanel } from "./current-home-panel";
import { HousingPanel } from "./housing-preferences-panel";
import { ErrorState } from "@/components/shared/error-state";
import { keys } from "./api/query-hooks";

function AccountSettings() {
    const ar = useLocale() === "ar";
    const t = useTranslations("Workspace");
    const { user, userId, logout } = useIdentity();
    const cache = useQueryClient();

    const notifications = useMutation({
        mutationFn: profileApi.notifications,
        onSuccess: async () =>
            cache.invalidateQueries({
                queryKey: keys.profile(userId),
            }),
    });

    return (
        <div className="grid w-full gap-5 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-5">
                <Panel title={t("accountDetails")}>
                    <p className="font-medium">{user.fullName}</p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">
                        <bdi>{user.email}</bdi>
                    </p>
                    <p className="mt-4 text-sm leading-7 text-muted-foreground">
                        {ar
                            ? "تعديل الاسم والبريد الإلكتروني مو متاح حاليًا."
                            : "Name and email updates are currently unavailable."}
                    </p>
                </Panel>

                <Panel title={t("notificationPreferences")}>
                    <label className="flex items-start gap-3 text-sm">
                        <input
                            type="checkbox"
                            className="mt-1 size-4 accent-primary"
                            checked={user.notificationsEnabled ?? false}
                            disabled={
                                notifications.isPending ||
                                user.notificationsEnabled === undefined
                            }
                            onChange={(event) =>
                                notifications.mutate(event.currentTarget.checked)
                            }
                            aria-describedby="notification-preferences-description"
                        />
                        <span>
              <span className="block font-medium">
                {t("accountNotificationsEnabled")}
              </span>
              <span
                  id="notification-preferences-description"
                  className="mt-1 block leading-6 text-muted-foreground"
              >
                {t("accountNotificationsDescription")}
              </span>
            </span>
                    </label>

                    {user.notificationsEnabled === undefined && (
                        <p className="mt-3 text-sm text-muted-foreground">
                            {t("notificationPreferenceUnavailable")}
                        </p>
                    )}

                    {notifications.isError && (
                        <ErrorState error={notifications.error} />
                    )}
                </Panel>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
                <Panel title={ar ? "تغيير كلمة المرور" : "Change password"}>
                    <ChangePasswordForm />
                </Panel>

                <details className="rounded-2xl border border-destructive/20 bg-card p-5">
                    <summary className="cursor-pointer text-sm font-medium text-destructive">
                        {t("accountStatus")}
                    </summary>

                    <p className="my-4 text-sm leading-7 text-muted-foreground">
                        {t("deactivateAccountHint")}
                    </p>

                    <DeleteAction
                        label={t("deactivateAccount")}
                        title={t("deactivateAccountTitle")}
                        description={t("deactivateAccountHint")}
                        confirmLabel={t("deactivateAccount")}
                        onDelete={async () => {
                            await profileApi.deactivate();
                            await logout();
                        }}
                    />
                </details>
            </div>
        </div>
    );
}

export function ProfilePage() {
    const ar = useLocale() === "ar";

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
            <PageHeading
                title={
                    ar
                        ? "ملفك وتفضيلاتك"
                        : "Your profile and preferences"
                }
                description={
                    ar
                        ? "احفظ تفضيلاتك والأماكن اللي تهمك عشان تقارن الخيارات."
                        : "Save your preferences and important places to compare options."
                }
            />

            <ProfileCompletionPanel />

            <Tabs
                defaultValue="housing"
                className="w-full min-w-0 gap-5"
            >
                <div className="flex justify-center">
                    <TabsList className="h-auto w-fit max-w-full flex-wrap justify-center gap-1 rounded-2xl p-1.5">
                        <TabsTrigger
                            value="housing"
                            className="min-h-10 gap-2 rounded-xl px-5"
                        >
                            <SlidersHorizontal className="size-4" />
                            {ar ? "السكن" : "Housing"}
                        </TabsTrigger>

                        <TabsTrigger
                            value="home"
                            className="min-h-10 gap-2 rounded-xl px-5"
                        >
                            <MapPin className="size-4" />
                            {ar ? "المنزل" : "Home"}
                        </TabsTrigger>

                        <TabsTrigger
                            value="account"
                            className="min-h-10 gap-2 rounded-xl px-5"
                        >
                            <UserRound className="size-4" />
                            {ar ? "الحساب" : "Account"}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent
                    value="housing"
                    className="w-full min-w-0"
                >
                    <HousingPanel />
                </TabsContent>

                <TabsContent
                    value="home"
                    className="w-full min-w-0"
                >
                    <HomePanel />
                </TabsContent>

                <TabsContent
                    value="account"
                    className="w-full min-w-0"
                >
                    <AccountSettings />
                </TabsContent>
            </Tabs>
        </div>
    );
}
