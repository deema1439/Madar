
package com.example.madar.Client;

import com.example.madar.Api.ApiException;
import com.example.madar.DTO.Out.GoogleRoutes.GoogleRouteResponseDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.client.RestClientResponseException;

@Component
public class GoogleRoutesClient {

    private static final long CACHE_TTL_NANOS =
            Duration.ofMinutes(15).toNanos();

    private final RestClient restClient;

    private final Map<RouteKey, CacheEntry> cache =
            new ConcurrentHashMap<>();

    private final Map<RouteKey, CompletableFuture<GoogleRouteResponseDTO.Route>>
            inFlight = new ConcurrentHashMap<>();

    public GoogleRoutesClient(
            RestClient.Builder builder,
            @Value("${google.routes-url}") String baseUrl,
            @Value("${google.api-key}") String apiKey) {

        this.restClient = builder.clone()
                .baseUrl(baseUrl)
                .defaultHeader("X-Goog-Api-Key", apiKey)
                .build();
    }

    public GoogleRouteResponseDTO.Route computeRoute(
            Double originLat,
            Double originLng,
            Double destinationLat,
            Double destinationLng) {

        validateCoordinates(originLat, originLng);
        validateCoordinates(destinationLat, destinationLng);

        if (originLat.equals(destinationLat)
                && originLng.equals(destinationLng)) {
            return new GoogleRouteResponseDTO.Route(0, "0s");
        }

        RouteKey key = new RouteKey(
                originLat, originLng,
                destinationLat, destinationLng
        );

        CacheEntry cached = cache.get(key);

        if (cached != null
                && System.nanoTime() - cached.createdAtNanos()
                < CACHE_TTL_NANOS) {
            return cached.route();
        }

        CompletableFuture<GoogleRouteResponseDTO.Route> future =
                new CompletableFuture<>();

        CompletableFuture<GoogleRouteResponseDTO.Route> existing =
                inFlight.putIfAbsent(key, future);

        if (existing != null) {
            try {
                return existing.join();
            } catch (CompletionException e) {
                if (e.getCause() instanceof RuntimeException runtime) {
                    throw runtime;
                }
                throw new ApiException("Failed to calculate route");
            }
        }

        try {
            // Another request may have completed before we acquired the key.
            CacheEntry latest = cache.get(key);

            if (latest != null
                    && System.nanoTime() - latest.createdAtNanos()
                    < CACHE_TTL_NANOS) {
                future.complete(latest.route());
                return latest.route();
            }

            GoogleRouteResponseDTO.Route route =
                    fetchRoute(originLat, originLng,
                            destinationLat, destinationLng);

            cache.put(key, new CacheEntry(
                    route, System.nanoTime()
            ));

            future.complete(route);
            return route;

        } catch (RouteProviderException e) {

            CacheEntry fallback = cache.get(key);

            if (fallback != null) {
                future.complete(fallback.route());
                return fallback.route();
            }

            future.completeExceptionally(e);
            throw e;

        } catch (RuntimeException e) {
            future.completeExceptionally(e);
            throw e;

        } finally {
            inFlight.remove(key, future);
        }
    }

    private GoogleRouteResponseDTO.Route fetchRoute(
            Double originLat,
            Double originLng,
            Double destinationLat,
            Double destinationLng) {

        Map<String, Object> origin = Map.of(
                "location", Map.of(
                        "latLng", Map.of(
                                "latitude", originLat,
                                "longitude", originLng
                        )
                )
        );

        Map<String, Object> destination = Map.of(
                "location", Map.of(
                        "latLng", Map.of(
                                "latitude", destinationLat,
                                "longitude", destinationLng
                        )
                )
        );

        Map<String, Object> request = Map.of(
                "origin", origin,
                "destination", destination,
                "travelMode", "DRIVE",
                "routingPreference", "TRAFFIC_AWARE"
        );

        try {
            GoogleRouteResponseDTO response = restClient.post()
                    .uri("/directions/v2:computeRoutes")
                    .header(
                            "X-Goog-FieldMask",
                            "routes.distanceMeters,routes.duration"
                    )
                    .body(request)
                    .retrieve()
                    .body(GoogleRouteResponseDTO.class);

            if (response == null
                    || response.routes() == null
                    || response.routes().isEmpty()) {
                throw new ApiException("No route found");
            }

            GoogleRouteResponseDTO.Route route =
                    response.routes().get(0);

            if (route == null
                    || route.distanceMeters() == null
                    || route.duration() == null
                    || route.duration().isBlank()) {
                throw new ApiException(
                        "Google Routes returned incomplete distance or duration data"
                );
            }

            return route;

        } catch (RestClientResponseException e) {

            int status = e.getStatusCode().value();

            if (status == 429 || status >= 500) {
                throw new RouteProviderException(
                        "Google Routes temporarily unavailable", e
                );
            }

            throw new ApiException(
                    "Google Routes request failed: " + status
            );

        } catch (RestClientException e) {

            throw new RouteProviderException(
                    "Google Routes connection failed", e
            );
        }
    }

    private void validateCoordinates(Double lat, Double lng) {
        if (lat == null || lng == null
                || !Double.isFinite(lat)
                || !Double.isFinite(lng)
                || lat < -90 || lat > 90
                || lng < -180 || lng > 180) {
            throw new ApiException("Invalid route coordinates");
        }
    }

    private record RouteKey(
            Double originLat,
            Double originLng,
            Double destinationLat,
            Double destinationLng
    ) {}

    private record CacheEntry(
            GoogleRouteResponseDTO.Route route,
            long createdAtNanos
    ) {}
    public static class RouteProviderException
            extends ApiException {

        public RouteProviderException(
                String message,
                Throwable cause
        ) {
            super("Failed to calculate route: " + message);
            initCause(cause);
        }
    }
}
