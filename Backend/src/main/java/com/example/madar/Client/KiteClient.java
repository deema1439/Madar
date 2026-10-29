
package com.example.madar.Client;

import com.example.madar.Api.ApiException;
import com.example.madar.DTO.In.Property.KiteDTO;
import com.example.madar.DTO.In.Location.KiteLocationsDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

@Component
public class KiteClient {

    private static final long CACHE_MINUTES = 60;
    private static final long NEIGHBORHOODS_CACHE_MINUTES = 24 * 60;
    private static final int MAX_CACHE_ENTRIES = 500;

    private final RestClient restClient;

    private final Map<String, CacheEntry> cache =
            new ConcurrentHashMap<>();

    private final Map<String, CompletableFuture<Object>> inFlight =
            new ConcurrentHashMap<>();

    private final AtomicInteger kiteCalls = new AtomicInteger();

    private final Object cacheLock = new Object();

    public KiteClient(
            RestClient.Builder builder,
            @Value("${kite.base-url}") String baseUrl,
            @Value("${kite.api-key}") String apiKey) {

        this.restClient = builder.clone()
                .baseUrl(baseUrl)
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + apiKey
                )
                .build();
    }

    // Shared cache for property and location requests.
    private <T> T cachedRequest(
            String key,
            Class<T> type,
            long ttlMinutes,
            Supplier<T> request) {

        CacheEntry cached = getValidCache(key);

        if (cached != null) {
            return type.cast(cached.value());
        }

        CompletableFuture<Object> future = new CompletableFuture<>();

        CompletableFuture<Object> existing =
                inFlight.putIfAbsent(key, future);

        // Identical concurrent requests share one provider call.
        if (existing != null) {
            try {
                return type.cast(existing.join());
            } catch (CompletionException e) {
                if (e.getCause() instanceof RuntimeException runtime) {
                    throw runtime;
                }
                throw new ApiException("Kite request failed");
            }
        }

        try {
            // Recheck cache after acquiring the in-flight slot.
            cached = getValidCache(key);

            if (cached != null) {
                future.complete(cached.value());
                return type.cast(cached.value());
            }

            // Count attempted outbound requests, including failed ones.
            kiteCalls.incrementAndGet();

            T result = request.get();

            // Do not cache null or provider errors.
            if (result != null) {
                putCache(key, result, ttlMinutes);
            }

            future.complete(result);
            return result;

        } catch (RuntimeException e) {
            future.completeExceptionally(e);
            throw e;
        } finally {
            inFlight.remove(key, future);
        }
    }

    private CacheEntry getValidCache(String key) {

        CacheEntry entry = cache.get(key);

        if (entry == null) {
            return null;
        }

        if (System.currentTimeMillis() >= entry.expiresAt()) {
            cache.remove(key, entry);
            return null;
        }

        return entry;
    }

    private void putCache(
            String key,
            Object value,
            long ttlMinutes) {

        synchronized (cacheLock) {

            long now = System.currentTimeMillis();

            // Remove expired entries before enforcing the size limit.
            cache.entrySet().removeIf(entry ->
                    now >= entry.getValue().expiresAt()
            );

            // Remove the oldest entry instead of clearing all cache.
            if (!cache.containsKey(key)
                    && cache.size() >= MAX_CACHE_ENTRIES) {

                String oldestKey = null;
                long oldestTime = Long.MAX_VALUE;

                for (Map.Entry<String, CacheEntry> entry
                        : cache.entrySet()) {

                    if (entry.getValue().createdAt() < oldestTime) {
                        oldestTime = entry.getValue().createdAt();
                        oldestKey = entry.getKey();
                    }
                }

                if (oldestKey != null) {
                    cache.remove(oldestKey);
                }
            }

            cache.put(
                    key,
                    new CacheEntry(
                            value,
                            now,
                            now + ttlMinutes * 60_000L
                    )
            );
        }
    }

    private <T> T cachedGet(String url, Class<T> type) {

        long ttl = url.contains("/neighborhoods")
                ? NEIGHBORHOODS_CACHE_MINUTES
                : CACHE_MINUTES;

        return cachedRequest(
                "GET:" + url,
                type,
                ttl,
                () -> restClient.get()
                        .uri(url)
                        .retrieve()
                        .body(type)
        );
    }

    // Location reference endpoints use the same cache.
    public KiteLocationsDTO.CitiesResponse getLocationCities() {

        return getLocationReference(
                "/cities",
                KiteLocationsDTO.CitiesResponse.class
        );
    }

    public KiteLocationsDTO.NeighborhoodsResponse
    getLocationNeighborhoods(String city) {

        return getLocationReference(
                "/cities/{city}/neighborhoods",
                KiteLocationsDTO.NeighborhoodsResponse.class,
                city
        );
    }

    private <T> T getLocationReference(
            String path,
            Class<T> responseType,
            Object... uriVariables) {

        try {
            String key = "LOCATION:" + path
                    + ":" + Arrays.deepToString(uriVariables);

            long ttl = path.contains("/neighborhoods")
                    ? NEIGHBORHOODS_CACHE_MINUTES
                    : CACHE_MINUTES;

            return cachedRequest(
                    key,
                    responseType,
                    ttl,
                    () -> restClient.get()
                            .uri(path, uriVariables)
                            .accept(MediaType.APPLICATION_JSON)
                            .retrieve()
                            .body(responseType)
            );

        } catch (HttpClientErrorException e) {

            int status = e.getStatusCode().value();

            if (status == 401 || status == 403) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Location provider access is unavailable"
                );
            }

            if (status == 429) {
                throw new ResponseStatusException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "Location provider rate limit reached; try again later"
                );
            }

            if (uriVariables.length > 0 && status == 404) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "City not found"
                );
            }

            if (uriVariables.length > 0 && status == 400) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Location provider rejected the city identifier"
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve locations from the provider"
            );

        } catch (ResourceAccessException e) {

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Location provider is temporarily unavailable"
            );

        } catch (RestClientException e) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve locations from the provider"
            );
        }
    }

    // Public listing discovery with stable cache keys.
    public KiteDTO.ListResponse discoverListings(
            Map<String, Object> filters) {

        try {
            Map<String, Object> safeFilters =
                    new TreeMap<>(filters);

            String key = buildDiscoveryCacheKey(safeFilters);

            return cachedRequest(
                    key,
                    KiteDTO.ListResponse.class,
                    CACHE_MINUTES,
                    () -> restClient.get()
                            .uri(builder -> {
                                builder.path("/listings");

                                safeFilters.forEach((name, value) ->
                                        builder.queryParam(
                                                name,
                                                "{" + name + "}"
                                        )
                                );

                                return builder.build(safeFilters);
                            })
                            .retrieve()
                            .body(KiteDTO.ListResponse.class)
            );

        } catch (HttpClientErrorException e) {

            int status = e.getStatusCode().value();

            if (status == 400) {
                throw new ApiException(
                        "Kite rejected the city, filters, cursor, or page size allowed by the current plan"
                );
            }

            if (status == 429) {
                throw new ResponseStatusException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        getErrorMessage(status)
                );
            }

            if (status == 404) {
                throw new ApiException(
                        "Kite city or filter reference was not found"
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Kite could not complete the property search"
            );

        } catch (RestClientException e) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Kite is unavailable right now"
            );
        }
    }

    private String buildDiscoveryCacheKey(
            Map<String, Object> filters) {

        StringBuilder key = new StringBuilder("DISCOVERY");

        filters.forEach((name, value) -> {
            String text = String.valueOf(value);

            key.append("|")
                    .append(name.length())
                    .append(":")
                    .append(name)
                    .append("=")
                    .append(text.length())
                    .append(":")
                    .append(text);
        });

        return key.toString();
    }

    // Search listings.
    public KiteDTO.ListResponse searchListings(
            String city,
            String listingType,
            String propertyType,
            Integer minPrice,
            Integer maxPrice) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20";

        url = addFilters(url, propertyType, minPrice, maxPrice);

        return callListings(url);
    }

    // Count listings.
    public KiteDTO.CountResponse countListings(
            String city,
            String listingType,
            String propertyType,
            Integer minPrice,
            Integer maxPrice) {

        String url = "/listings/count?city=" + city
                + "&listing_type=" + listingType;

        url = addFilters(url, propertyType, minPrice, maxPrice);

        try {
            return cachedGet(url, KiteDTO.CountResponse.class);

        } catch (HttpClientErrorException e) {
            throw new ApiException(
                    getErrorMessage(e.getStatusCode().value())
            );

        } catch (RestClientException e) {
            throw new ApiException("Kite is unavailable right now");
        }
    }

    // Get one listing.
    public KiteDTO.SingleResponse getListing(String externalId) {

        try {
            return cachedGet(
                    "/listings/" + externalId,
                    KiteDTO.SingleResponse.class
            );

        } catch (HttpClientErrorException e) {
            throw new ApiException(
                    getErrorMessage(e.getStatusCode().value())
            );

        } catch (RestClientException e) {
            throw new ApiException("Kite is unavailable right now");
        }
    }

    private String addFilters(
            String url,
            String propertyType,
            Integer minPrice,
            Integer maxPrice) {

        if (propertyType != null) {
            url += "&property_type=" + propertyType;
        }

        if (minPrice != null) {
            url += "&price_min=" + minPrice;
        }

        if (maxPrice != null) {
            url += "&price_max=" + maxPrice;
        }

        return url;
    }

    private String getErrorMessage(int status) {

        if (status == 400) {
            return "Invalid search filters";
        }

        if (status == 401 || status == 403) {
            return "Kite API key is invalid";
        }

        if (status == 404) {
            return "Property not found or no longer listed";
        }

        if (status == 429) {
            return "Too many requests to Kite, try again later";
        }

        return "Kite returned an unexpected error";
    }

    // Cheapest listing in the whole market.
    public KiteDTO.ListResponse getCheapestListing(
            String city,
            String listingType,
            String propertyType,
            Integer maxPrice) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&sort=price_asc&limit=1";

        url = addFilters(url, propertyType, null, maxPrice);

        return callListings(url);
    }

    // Neighborhoods of a city.
    public KiteDTO.NeighborhoodsResponse getNeighborhoods(
            String city) {

        try {
            return cachedGet(
                    "/cities/" + city + "/neighborhoods",
                    KiteDTO.NeighborhoodsResponse.class
            );

        } catch (HttpClientErrorException e) {
            throw new ApiException(
                    getErrorMessage(e.getStatusCode().value())
            );

        } catch (RestClientException e) {
            throw new ApiException("Kite is unavailable right now");
        }
    }

    // Count listings inside one neighborhood.
    public KiteDTO.CountResponse countInNeighborhood(
            String city,
            String listingType,
            String propertyType,
            Integer maxPrice,
            Integer neighborhoodId) {

        String url = "/listings/count?city=" + city
                + "&listing_type=" + listingType
                + "&neighborhood_id=" + neighborhoodId;

        url = addFilters(url, propertyType, null, maxPrice);

        try {
            return cachedGet(url, KiteDTO.CountResponse.class);

        } catch (HttpClientErrorException e) {
            throw new ApiException(
                    getErrorMessage(e.getStatusCode().value())
            );

        } catch (RestClientException e) {
            throw new ApiException("Kite is unavailable right now");
        }
    }

    // Search listings inside one neighborhood.
    public KiteDTO.ListResponse searchInNeighborhood(
            String city,
            String listingType,
            String propertyType,
            Integer maxPrice,
            Integer neighborhoodId) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20&neighborhood_id=" + neighborhoodId;

        url = addFilters(url, propertyType, null, maxPrice);

        return callListings(url);
    }

    // Kite sorting: price_asc, price_desc, newest, price_drop.
    public KiteDTO.ListResponse searchSorted(
            String city,
            String listingType,
            String propertyType,
            Integer maxPrice,
            String sort,
            Integer limit) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&sort=" + sort
                + "&limit=" + limit;

        url = addFilters(url, propertyType, null, maxPrice);

        return callListings(url);
    }

    // Search inside several neighborhoods.
    public KiteDTO.ListResponse searchInNeighborhoods(
            String city,
            String listingType,
            String propertyType,
            String neighborhoodIds) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20&neighborhood_id=" + neighborhoodIds;

        url = addFilters(url, propertyType, null, null);

        return callListings(url);
    }

    // Search inside a map bounding box.
    public KiteDTO.ListResponse searchInBox(
            String city,
            String listingType,
            String propertyType,
            String bbox) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20&bbox=" + bbox;

        url = addFilters(url, propertyType, null, null);

        return callListings(url);
    }

    // Search inside a box with price range.
    public KiteDTO.ListResponse searchInBoxWithPrice(
            String city,
            String listingType,
            String propertyType,
            Integer minPrice,
            Integer maxPrice,
            String bbox) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20&bbox=" + bbox;

        url = addFilters(url, propertyType, minPrice, maxPrice);

        return callListings(url);
    }

    // Shared listing call with existing error handling.
    private KiteDTO.ListResponse callListings(String url) {

        try {
            return cachedGet(url, KiteDTO.ListResponse.class);

        } catch (HttpClientErrorException e) {
            throw new ApiException(
                    getErrorMessage(e.getStatusCode().value())
            );

        } catch (RestClientException e) {
            throw new ApiException("Kite is unavailable right now");
        }
    }

    // Search neighborhoods with price range.
    public KiteDTO.ListResponse searchInNeighborhoodsWithPrice(
            String city,
            String listingType,
            String propertyType,
            Integer minPrice,
            Integer maxPrice,
            String neighborhoodIds) {

        String url = "/listings?city=" + city
                + "&listing_type=" + listingType
                + "&limit=20&neighborhood_id=" + neighborhoodIds;

        url = addFilters(url, propertyType, minPrice, maxPrice);

        return callListings(url);
    }

    private record CacheEntry(
            Object value,
            long createdAt,
            long expiresAt
    ) {}
}
