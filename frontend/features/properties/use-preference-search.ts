"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCurrentUserId } from "@/features/account/session-hooks";
import { getUserId } from "@/lib/user-id";
import { preferencesApi } from "@/lib/api/preferences";
import {
  locationCatalogOptions,
  locationNeighborhoodKey,
} from "@/lib/api/location-query-options";
import { locations } from "@/lib/api/locations";
import {
  hasExplicitSearch,
  mapHousingToSearch,
  preferredCity,
  searchSnapshot,
  type PreferenceMappingIssue,
} from "./preference-search";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

async function resolvePreferences(
  cache: QueryClient,
  userId: number,
  signal: AbortSignal,
) {
  const preference = await cache.fetchQuery({
    queryKey: ["housing-preference", userId],
    queryFn: ({ signal: querySignal }) =>
      preferencesApi.get(AbortSignal.any([querySignal, AbortSignal.timeout(10_000)])),
    staleTime: 60_000,
    retry: false,
  });
  signal.throwIfAborted();
  if (!preference)
    return { filters: {}, issues: [] as PreferenceMappingIssue[], found: false };
  let cities: Awaited<ReturnType<typeof locations.catalog>> = [];
  let neighborhoods: Awaited<ReturnType<typeof locations.neighborhoods>> = [];
  const issues: PreferenceMappingIssue[] = [];
  if (preference.city) {
    try {
      cities = await cache.fetchQuery(locationCatalogOptions());
    } catch {
      issues.push("catalog");
    }
    signal.throwIfAborted();
    const city = preferredCity(preference, cities);
    if (city && preference.district?.trim()) {
      try {
        neighborhoods = await cache.fetchQuery({
          queryKey: locationNeighborhoodKey(city.slug),
          queryFn: ({ signal }) => locations.neighborhoods(city.slug, signal),
          staleTime: 10 * 60_000,
          gcTime: 30 * 60_000,
          retry: false,
        });
      } catch {
        issues.push("catalog");
      }
    }
  }
  signal.throwIfAborted();
  const mapped = mapHousingToSearch(preference, cities, neighborhoods);
  return { ...mapped, issues: [...issues, ...mapped.issues], found: true };
}

/** Bound the whole initialization, without cancelling shared location queries. */
function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

const isCurrent = (url: string, id: number | null) =>
  new URLSearchParams(window.location.search).toString() === url &&
  (Number(getUserId()) || null) === id;
const commit = (next: URLSearchParams, replace: boolean) =>
  window.history[replace ? "replaceState" : "pushState"](
    null,
    "",
    `${window.location.pathname}?${next}${window.location.hash}`,
  );

export function usePreferenceSearch(serialized: string) {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const hydrated = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const explicit = hasExplicitSearch(new URLSearchParams(serialized));
  const params = new URLSearchParams(serialized);
  const guestWithPreferences =
      hydrated &&
      userId === null &&
      params.get("searchState") === "preferences";
  const needsInitialization = hydrated && !explicit && userId !== null;
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<"failed" | "none" | null>(null);
  const restoreRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!guestWithPreferences) return;

    commit(
        searchSnapshot(new URLSearchParams(serialized), {}, "manual"),
        true,
    );
  }, [guestWithPreferences, serialized]);

  useEffect(() => {
    if (!hydrated || explicit || guestWithPreferences) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    const current = () => !controller.signal.aborted && isCurrent(serialized, userId);
    if (userId === null) {
      commit(searchSnapshot(new URLSearchParams(serialized), {}, "manual"), true);
      return;
    }
    void withinDeadline(resolvePreferences(cache, userId, signal), signal)
      .then((result) => {
        if (!current()) return;
        commit(
          searchSnapshot(
            new URLSearchParams(serialized),
            result.filters,
            result.found ? "preferences" : "manual",
            result.issues,
          ),
          true,
        );
      })
      .catch(() => {
        if (!current()) return;
        setFeedback("failed");
        commit(searchSnapshot(new URLSearchParams(serialized), {}, "manual"), true);
      });
    return () => controller.abort();
  }, [hydrated, explicit, guestWithPreferences, serialized, userId, cache]);
  useEffect(
    () => () => {
      restoreRequest.current?.abort();
    },
    [serialized, userId],
  );
  const restore = async () => {
    if (!userId || restoreRequest.current) return;
    const controller = new AbortController();
    restoreRequest.current = controller;
    setRestoring(true);
    setFeedback(null);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    try {
      const result = await withinDeadline(
        resolvePreferences(cache, userId, signal),
        signal,
      );
      if (controller.signal.aborted || !isCurrent(serialized, userId)) return;
      if (!result.found) {
        setFeedback("none");
        return;
      }
      commit(
        searchSnapshot(
          new URLSearchParams(serialized),
          result.filters,
          "preferences",
          result.issues,
        ),
        false,
      );
    } catch {
      if (!controller.signal.aborted && isCurrent(serialized, userId))
        setFeedback("failed");
    } finally {
      if (restoreRequest.current === controller) {
        restoreRequest.current = null;
        setRestoring(false);
      }
    }
  };
  const cancelRestore = () => {
    restoreRequest.current?.abort();
    restoreRequest.current = null;
    setRestoring(false);
  };
  return {
    cancelRestore,
    initializing: !hydrated || needsInitialization,
    restoring,
    restore,
    userId,
    feedback,
  };
}
