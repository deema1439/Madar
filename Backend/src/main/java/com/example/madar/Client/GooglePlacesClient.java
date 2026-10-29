
package com.example.madar.Client;

import com.example.madar.Api.ApiException;
import com.example.madar.DTO.Out.GooglePlaces.GooglePlacesResponseDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

@Component
public class GooglePlacesClient {

    private static final long NEARBY_TTL =
            Duration.ofMinutes(60).toNanos();

    private static final long TEXT_TTL =
            Duration.ofMinutes(30).toNanos();

    private static final int MAX_CACHE_ENTRIES = 300;

    private static final String FIELD_MASK =
            "places.id,places.displayName,places.formattedAddress,"
                    + "places.location,places.primaryType,places.types";

    private final RestClient restClient;

    private final Map<SearchKey, CacheEntry> cache =
            new ConcurrentHashMap<>();

    private final Map<SearchKey,
            CompletableFuture<GooglePlacesResponseDTO>> inFlight =
            new ConcurrentHashMap<>();

    private final AtomicInteger apiCalls = new AtomicInteger();

    private final Object cacheLock = new Object();

    public GooglePlacesClient(
            RestClient.Builder builder,
            @Value("${google.places-url}") String baseUrl,
            @Value("${google.api-key}") String apiKey) {

        this.restClient = builder.clone()
                .baseUrl(baseUrl)
                .defaultHeader("X-Goog-Api-Key", apiKey)
                .build();
    }

    // Search a single nearby type.
    public GooglePlacesResponseDTO searchNearbyPlaces(
            Double latitude,
            Double longitude,
            String placeType,
            Double radiusMeters) {

        validateLocation(latitude, longitude, radiusMeters);

        if (placeType == null || placeType.isBlank()) {
            throw new ApiException("Place type is required");
        }

        List<String> types = List.of(placeType);

        SearchKey key = new SearchKey(
                "NEARBY_SINGLE",
                latitude,
                longitude,
                radiusMeters,
                placeType
        );

        return executeCached(
                key,
                NEARBY_TTL,
                () -> requestNearby(
                        latitude,
                        longitude,
                        types,
                        radiusMeters,
                        10
                )
        );
    }

    // Search multiple types in one Google request.
    public GooglePlacesResponseDTO searchNearbyPlacesBatch(
            Double latitude,
            Double longitude,
            List<String> placeTypes,
            Double radiusMeters) {

        validateLocation(latitude, longitude, radiusMeters);

        if (placeTypes == null || placeTypes.isEmpty()) {
            return emptyResponse();
        }

        if (placeTypes.stream().anyMatch(
                type -> type == null || type.isBlank())) {
            throw new ApiException("Invalid place type");
        }

        List<String> types = placeTypes.stream()
                .distinct()
                .sorted()
                .toList();

        if (types.size() > 50) {
            throw new ApiException(
                    "Maximum 50 place types are allowed"
            );
        }

        String typeKey = String.join("|", types);

        SearchKey key = new SearchKey(
                "NEARBY_BATCH",
                latitude,
                longitude,
                radiusMeters,
                typeKey
        );

        return executeCached(
                key,
                NEARBY_TTL,
                () -> requestNearby(
                        latitude,
                        longitude,
                        types,
                        radiusMeters,
                        20
                )
        );
    }

    // Text search around a location.
    public GooglePlacesResponseDTO searchPlacesByText(
            Double latitude,
            Double longitude,
            String query,
            Double radiusMeters) {

        validateLocation(latitude, longitude, radiusMeters);

        if (query == null || query.isBlank()) {
            throw new ApiException("Search query is required");
        }

        String normalizedQuery = query.trim();

        SearchKey key = new SearchKey(
                "TEXT",
                latitude,
                longitude,
                radiusMeters,
                normalizedQuery
        );

        return executeCached(
                key,
                TEXT_TTL,
                () -> requestText(
                        latitude,
                        longitude,
                        normalizedQuery,
                        radiusMeters
                )
        );
    }

    private GooglePlacesResponseDTO requestNearby(
            Double latitude,
            Double longitude,
            List<String> types,
            Double radiusMeters,
            int maxResults) {

        Map<String, Object> request = Map.of(
                "includedTypes", types,
                "maxResultCount", maxResults,
                "rankPreference", "DISTANCE",
                "locationRestriction", circle(
                        latitude, longitude, radiusMeters
                )
        );

        try {
            GooglePlacesResponseDTO response = restClient.post()
                    .uri("/v1/places:searchNearby")
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(request)
                    .retrieve()
                    .body(GooglePlacesResponseDTO.class);

            return normalizeResponse(response);

        } catch (RestClientException e) {
            throw new ApiException(
                    "Failed to search nearby places: " + e.getMessage()
            );
        }
    }

    private GooglePlacesResponseDTO requestText(
            Double latitude,
            Double longitude,
            String query,
            Double radiusMeters) {

        Map<String, Object> request = Map.of(
                "textQuery", query,
                "pageSize", 20,
                "locationBias", circle(
                        latitude, longitude, radiusMeters
                )
        );

        try {
            GooglePlacesResponseDTO response = restClient.post()
                    .uri("/v1/places:searchText")
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(request)
                    .retrieve()
                    .body(GooglePlacesResponseDTO.class);

            if (response == null) {
                throw new ApiException(
                        "Google Places returned an empty response"
                );
            }

            return normalizeResponse(response);

        } catch (RestClientException e) {
            throw new ApiException(
                    "Failed to search places by text"
            );
        }
    }

    private Map<String, Object> circle(
            Double latitude,
            Double longitude,
            Double radiusMeters) {

        return Map.of(
                "circle", Map.of(
                        "center", Map.of(
                                "latitude", latitude,
                                "longitude", longitude
                        ),
                        "radius", radiusMeters
                )
        );
    }

    private GooglePlacesResponseDTO executeCached(
            SearchKey key,
            long ttlNanos,
            Supplier<GooglePlacesResponseDTO> request) {

        CacheEntry cached = getValidCache(key);

        if (cached != null) {
            return cached.response();
        }

        CompletableFuture<GooglePlacesResponseDTO> future =
                new CompletableFuture<>();

        CompletableFuture<GooglePlacesResponseDTO> existing =
                inFlight.putIfAbsent(key, future);

        // Wait for an identical request already in progress.
        if (existing != null) {
            try {
                return existing.join();
            } catch (CompletionException e) {
                if (e.getCause() instanceof RuntimeException runtime) {
                    throw runtime;
                }
                throw new ApiException(
                        "Google Places request failed"
                );
            }
        }

        try {
            // Another request may have filled the cache.
            cached = getValidCache(key);

            if (cached != null) {
                future.complete(cached.response());
                return cached.response();
            }

            apiCalls.incrementAndGet();

            GooglePlacesResponseDTO result = request.get();

            putCache(key, result, ttlNanos);

            future.complete(result);
            return result;

        } catch (RuntimeException e) {
            future.completeExceptionally(e);
            throw e;
        } finally {
            inFlight.remove(key, future);
        }
    }

    private CacheEntry getValidCache(SearchKey key) {

        CacheEntry entry = cache.get(key);

        if (entry == null) {
            return null;
        }

        if (System.nanoTime() - entry.createdAtNanos()
                >= entry.ttlNanos()) {
            cache.remove(key, entry);
            return null;
        }

        return entry;
    }

    private void putCache(
            SearchKey key,
            GooglePlacesResponseDTO response,
            long ttlNanos) {

        synchronized (cacheLock) {

            long now = System.nanoTime();

            // Remove expired cache entries.
            cache.entrySet().removeIf(entry ->
                    now - entry.getValue().createdAtNanos()
                            >= entry.getValue().ttlNanos()
            );

            // Evict oldest entry, not the entire cache.
            if (!cache.containsKey(key)
                    && cache.size() >= MAX_CACHE_ENTRIES) {

                SearchKey oldestKey = null;
                long greatestAge = Long.MIN_VALUE;

                for (Map.Entry<SearchKey, CacheEntry> entry
                        : cache.entrySet()) {

                    long age = now
                            - entry.getValue().createdAtNanos();

                    if (age > greatestAge) {
                        greatestAge = age;
                        oldestKey = entry.getKey();
                    }
                }

                if (oldestKey != null) {
                    cache.remove(oldestKey);
                }
            }

            cache.put(
                    key,
                    new CacheEntry(response, now, ttlNanos)
            );
        }
    }

    private void validateLocation(
            Double latitude,
            Double longitude,
            Double radiusMeters) {

        if (latitude == null || longitude == null
                || !Double.isFinite(latitude)
                || !Double.isFinite(longitude)
                || latitude < -90 || latitude > 90
                || longitude < -180 || longitude > 180) {

            throw new ApiException("Invalid coordinates");
        }

        if (radiusMeters == null
                || !Double.isFinite(radiusMeters)
                || radiusMeters <= 0
                || radiusMeters > 50000) {

            throw new ApiException("Invalid search radius");
        }
    }

    private GooglePlacesResponseDTO normalizeResponse(
            GooglePlacesResponseDTO response) {

        if (response == null || response.places() == null) {
            return emptyResponse();
        }

        return new GooglePlacesResponseDTO(
                Collections.unmodifiableList(
                        new ArrayList<>(response.places())
                )
        );
    }

    private GooglePlacesResponseDTO emptyResponse() {
        return new GooglePlacesResponseDTO(List.of());
    }

    private record SearchKey(
            String operation,
            Double latitude,
            Double longitude,
            Double radius,
            String filter
    ) {}

    private record CacheEntry(
            GooglePlacesResponseDTO response,
            long createdAtNanos,
            long ttlNanos
    ) {}
}
