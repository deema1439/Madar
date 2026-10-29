
package com.example.madar.Service;

import com.example.madar.AI.RecommendationAI;
import com.example.madar.Api.ApiException;
import com.example.madar.DTO.In.Recommendation.RecommendationWeightsDTO;
import com.example.madar.DTO.Out.Commute.CommuteSummaryResponseDTO;
import com.example.madar.DTO.Out.GooglePlaces.GooglePlacesResponseDTO;
import com.example.madar.DTO.Out.Property.PropertyDTO;
import com.example.madar.DTO.Out.Recommendation.*;
import com.example.madar.Model.HousingPreference;
import com.example.madar.Repository.HousingPreferenceRepository;
import com.example.madar.Repository.PlacePreferenceRepository;
import com.example.madar.Model.LifestyleInterest;
import com.example.madar.Repository.LifestyleInterestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final PropertyService propertyService;
    private final PlacePreferenceService placePreferenceService;
    private final HousingPreferenceRepository housingPreferenceRepository;
    private final RecommendationAI recommendationAI;
    private final PlacePreferenceRepository placePreferenceRepository;
    private final LifestyleInterestRepository lifestyleInterestRepository;
    private final CreditService creditService;



    // Calculate a single property's suitability
    public PropertyMatchResponseDTO calculatePropertyMatch(Integer userId, String source, String externalId, RecommendationWeightsDTO weights) {

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        PropertyDTO property = propertyService.getPropertyById(source, externalId);



        return calculateScore(userId, property, preference, weights, true, null);
    }




    public SmartRecommendationResponseDTO getSmartRecommendations(Integer userId, RecommendationWeightsDTO weights, String language) {

        return buildSmartRecommendations(userId, weights, language, null);
    }

    public SmartRecommendationResponseDTO getSelectedNeighborhoodRecommendations(Integer userId, RecommendationWeightsDTO weights, String language) {

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        if (preference.getDistrict() == null || preference.getDistrict().isBlank()) {
            throw new ApiException("Please select a neighborhood first");
        }

        return buildSmartRecommendations(userId, weights, language, preference.getDistrict());
    }

    // Paid smart recommendations for direct user requests
    public SmartRecommendationResponseDTO getSmartRecommendationsWithCredits(
            Integer userId,
            RecommendationWeightsDTO weights,
            String language) {

        String operationId = UUID.randomUUID().toString();

        creditService.reserveCredits(userId, "TOP_3_RECOMMENDATIONS", operationId);

        try {
            SmartRecommendationResponseDTO response =
                    getSmartRecommendations(userId, weights, language);

            creditService.confirmCredits(userId, operationId);

            return response;

        } catch (Exception e) {
            try {
                creditService.cancelReservation(userId, operationId);
            } catch (Exception cancelException) {
                e.addSuppressed(cancelException);
            }

            throw e;
        }
    }


    // Paid recommendations within the user's selected neighborhood
    public SmartRecommendationResponseDTO getSelectedNeighborhoodRecommendationsWithCredits(
            Integer userId,
            RecommendationWeightsDTO weights,
            String language) {

        String operationId = UUID.randomUUID().toString();

        creditService.reserveCredits(userId, "TOP_3_RECOMMENDATIONS", operationId);

        try {
            SmartRecommendationResponseDTO response =
                    getSelectedNeighborhoodRecommendations(userId, weights, language);

            creditService.confirmCredits(userId, operationId);

            return response;

        } catch (Exception e) {
            try {
                creditService.cancelReservation(userId, operationId);
            } catch (Exception cancelException) {
                e.addSuppressed(cancelException);
            }

            throw e;
        }
    }


    // Calculate property suitability without Google Places
    public PropertyMatchResponseDTO calculateMatchWithoutPlaces(Integer userId, PropertyDTO property) {

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }


        return calculateScore(userId, property, preference, null, false, null);
    }


    // Evaluate neighborhood suitability using commutes and nearby services

    public NeighborhoodSuitabilityDTO getNeighborhoodSuitability(Integer userId, Double latitude, Double longitude, String district,String language) {

        if (latitude == null || longitude == null || !Double.isFinite(latitude) || !Double.isFinite(longitude) ||
                latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new ApiException("Invalid neighborhood coordinates");
        }

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        // Commute analysis is optional when no important locations exist.
        CommuteSummaryResponseDTO commute = null;
        Double commuteScore = null;

        if (!placePreferenceRepository.findPlacePreferencesByUser_Id(userId).isEmpty()) {
            commute = placePreferenceService.getCommuteAnalysis(userId, latitude, longitude);
            commuteScore = commute.commuteScore();
        }

        Double servicesScore = null;

        if (!Boolean.FALSE.equals(preference.getIncludeNearbyServices())) {
            servicesScore = calculateNeighborhoodServicesScore(
                    latitude,
                    longitude,
                    preference
            );
        }


        double neighborhoodScore;

        if (commuteScore != null && servicesScore != null) {
            neighborhoodScore = commuteScore * 0.60 + servicesScore * 0.40;
        } else if (commuteScore != null) {
            neighborhoodScore = commuteScore;
        } else if (servicesScore != null) {
            neighborhoodScore = servicesScore;
        } else {
            throw new ApiException("Neighborhood suitability data is unavailable");
        }

        neighborhoodScore = Math.round(neighborhoodScore * 100.0) / 100.0;

        String aiAnalysis = recommendationAI.explainNeighborhood(district, preference, commuteScore, servicesScore,language);

        boolean servicesAvailable = servicesScore != null;
        return new NeighborhoodSuitabilityDTO(district, neighborhoodScore, commuteScore, servicesScore, servicesAvailable, commute, aiAnalysis);
    }



    // Compare two neighborhood locations based on existing suitability scores
    public NeighborhoodComparisonDTO compareNeighborhoods(Integer userId, Double firstLatitude, Double firstLongitude, String firstDistrict, Double secondLatitude, Double secondLongitude, String secondDistrict, String language) {

        NeighborhoodSuitabilityDTO first = getNeighborhoodSuitability(userId, firstLatitude, firstLongitude, firstDistrict, language);

        NeighborhoodSuitabilityDTO second = getNeighborhoodSuitability(userId, secondLatitude, secondLongitude, secondDistrict, language);

        double firstScore = first.neighborhoodScore();
        double secondScore = second.neighborhoodScore();

        double difference = Math.round(Math.abs(firstScore - secondScore) * 100.0) / 100.0;

        String betterNeighborhood;

        if (firstScore > secondScore) {
            betterNeighborhood = "FIRST";
        } else if (secondScore > firstScore) {
            betterNeighborhood = "SECOND";
        } else {
            betterNeighborhood = "TIE";
        }

        return new NeighborhoodComparisonDTO(first, second, betterNeighborhood, difference);
    }




    public NeighborhoodSuggestionsResponseDTO suggestNeighborhoods(Integer userId, String language) {
        return suggestNeighborhoods(userId, language, null);
    }

    public NeighborhoodSuggestionsResponseDTO suggestNeighborhoods(Integer userId, String language, RecommendationWeightsDTO weights) {


        HousingPreference preference =
                housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        if (preference.getMaxBudget() == null
                || preference.getMaxBudget().signum() <= 0) {
            throw new ApiException("Housing budget is invalid");
        }

        // Find available properties matching the user's housing preferences
        List<PropertyDTO> properties = propertyService.search(
                preference.getCity(),
                preference.getListingType(),
                preference.getPropertyType(),
                preference.getMaxBudget().intValue()
        );

        if (properties == null || properties.isEmpty()) {
            throw new ApiException("No matching properties found");
        }

        // Group valid properties by neighborhood
        Map<String, List<PropertyDTO>> neighborhoods = new LinkedHashMap<>();

        for (PropertyDTO property : properties) {

            if (property == null
                    || property.getNeighborhood() == null
                    || property.getNeighborhood().isBlank()
                    || property.getLatitude() == null
                    || property.getLongitude() == null
                    || !Double.isFinite(property.getLatitude())
                    || !Double.isFinite(property.getLongitude())
                    || Math.abs(property.getLatitude()) > 90
                    || Math.abs(property.getLongitude()) > 180
                    || property.getPrice() == null
                    || property.getPrice() <= 0
                    || property.getPrice() > preference.getMaxBudget().doubleValue()) {
                continue;
            }

            String district = property.getNeighborhood().trim();

            neighborhoods.computeIfAbsent(
                    district, key -> new ArrayList<>()
            ).add(property);
        }

        if (neighborhoods.isEmpty()) {
            throw new ApiException("No neighborhoods with valid property locations");
        }

        // Evaluate up to 5 candidate neighborhoods
        List<List<PropertyDTO>> candidates = neighborhoods.values()
                .stream()
                .sorted(Comparator.comparingInt(
                        (List<PropertyDTO> group) -> group.size()
                ).reversed())
                .limit(5)
                .toList();

        List<NeighborhoodSuggestionsResponseDTO.SuggestedNeighborhood> evaluated =
                new ArrayList<>();

        for (List<PropertyDTO> group : candidates) {

            // Select a representative actual listing location
            List<Double> latitudes = group.stream()
                    .map(PropertyDTO::getLatitude)
                    .sorted()
                    .toList();

            List<Double> longitudes = group.stream()
                    .map(PropertyDTO::getLongitude)
                    .sorted()
                    .toList();

            double middleLatitude = latitudes.get(latitudes.size() / 2);
            double middleLongitude = longitudes.get(longitudes.size() / 2);

            PropertyDTO representative = group.stream()
                    .min(Comparator.comparingDouble(property ->
                            Math.pow(property.getLatitude() - middleLatitude, 2)
                                    + Math.pow(
                                    (property.getLongitude() - middleLongitude)
                                            * Math.cos(Math.toRadians(middleLatitude)),
                                    2
                            )
                    ))
                    .orElseThrow();

            Integer lowestPrice = group.stream()
                    .map(PropertyDTO::getPrice)
                    .min(Integer::compareTo)
                    .orElse(null);

            // Reuse our existing neighborhood scoring and AI explanation
            try {
                NeighborhoodSuitabilityDTO suitability =
                        getNeighborhoodSuitability(
                                userId,
                                representative.getLatitude(),
                                representative.getLongitude(),
                                representative.getNeighborhood(),
                                language
                        );


                PropertyMatchResponseDTO match = calculateScore(
                        userId,
                        representative,
                        preference,
                        weights,
                        false,
                        suitability.servicesScore()
                );



                evaluated.add(
                        new NeighborhoodSuggestionsResponseDTO.SuggestedNeighborhood(
                                0,
                                representative.getNeighborhood(),
                                representative.getLatitude(),
                                representative.getLongitude(),
                                group.size(),
                                lowestPrice,
                                match.housingScore(),
                                match.matchScore(),
                                suitability
                        )
                );


            } catch (ApiException e) {
                // Skip a candidate only if its suitability cannot be evaluated
                log.warn(
                        "Neighborhood {} could not be evaluated: {}",
                        representative.getNeighborhood(),
                        e.getMessage()
                );
            }
        }

        if (evaluated.isEmpty()) {
            throw new ApiException("Neighborhood suggestions are unavailable");
        }


        evaluated.sort(Comparator.comparingDouble((NeighborhoodSuggestionsResponseDTO.SuggestedNeighborhood item) -> item.matchScore()).reversed());


        List<NeighborhoodSuggestionsResponseDTO.SuggestedNeighborhood> top =
                new ArrayList<>();

        for (int i = 0; i < Math.min(3, evaluated.size()); i++) {

            var item = evaluated.get(i);


            top.add(
                    new NeighborhoodSuggestionsResponseDTO.SuggestedNeighborhood(
                            i + 1,
                            item.district(),
                            item.latitude(),
                            item.longitude(),
                            item.sampledPropertyCount(),
                            item.lowestSampledPrice(),
                            item.housingScore(),
                            item.matchScore(),
                            item.suitability()
                    )
            );

        }

        String aiAnalysis = recommendationAI.explainNeighborhoodSuggestions(top, preference, language);

        return new NeighborhoodSuggestionsResponseDTO(
                preference.getCity(),
                "Suggestions are based on available Kite property samples, "
                        + "not every neighborhood in the city. "
                        + "Coordinates represent actual sampled listings.",
                top, aiAnalysis);

    }



    public void selectNeighborhood(Integer userId, String district) {

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        if (district == null || district.isBlank()) {
            throw new ApiException("Neighborhood is required");
        }

        district = district.trim();

        if (district.length() > 100) {
            throw new ApiException("Neighborhood name is too long");
        }

        preference.setDistrict(district);
        housingPreferenceRepository.save(preference);
    }



    //helper method

    private SmartRecommendationResponseDTO buildSmartRecommendations(Integer userId, RecommendationWeightsDTO weights, String language, String selectedDistrict) {


        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        if (preference.getMaxBudget() == null || preference.getMaxBudget().doubleValue() <= 0) {
            throw new ApiException("Housing budget is invalid");
        }

        // Fetch properties using the existing property search
        List<PropertyDTO> candidates = propertyService.search(preference.getCity(), preference.getListingType(), preference.getPropertyType(), preference.getMaxBudget().intValue());

        if (candidates == null || candidates.isEmpty()) {
            throw new ApiException("No properties found for recommendation");
        }

        // Select up to 15 properties with sufficient data

        List<PropertyDTO> selected = candidates.stream()
                .filter(property -> property != null
                        && property.getExternalId() != null
                        && property.getSource() != null
                        && property.getLatitude() != null
                        && property.getLongitude() != null
                        && property.getPrice() != null
                        && property.getPrice() > 0)
                .filter(property -> selectedDistrict == null
                        || (property.getNeighborhood() != null
                        && property.getNeighborhood().trim()
                        .equalsIgnoreCase(selectedDistrict.trim())))
                .limit(15)
                .toList();


        if (selected.isEmpty()) {
            throw new ApiException("No properties have sufficient data for matching");
        }

        // Calculate services consistently for all candidates
        Map<String, Double> servicesScores = new HashMap<>();

        boolean servicesEvaluated =
                !Boolean.FALSE.equals(preference.getIncludeNearbyServices());

        if (servicesEvaluated) {

            for (PropertyDTO property : selected) {

                Double score = calculateNeighborhoodServicesScore(
                        property.getLatitude(),
                        property.getLongitude(),
                        preference
                );

                if (score == null) {
                    servicesEvaluated = false;
                    servicesScores.clear();

                    log.warn(
                            "Services evaluation unavailable. Ranking all properties without services."
                    );
                    break;
                }

                servicesScores.put(property.getExternalId(), score);
            }
        }

        // Use the same scoring factors for every property
        final boolean useServices = servicesEvaluated;


        List<PropertyMatchResponseDTO> ranked;

        try {
            // Try Google Routes for all properties.
            ranked = selected.stream()
                    .map(property -> calculateScore(
                            userId,
                            property,
                            preference,
                            weights,
                            false,
                            useServices
                                    ? servicesScores.get(property.getExternalId())
                                    : null,
                            false
                    ))
                    .sorted(Comparator.comparing(
                            PropertyMatchResponseDTO::matchScore
                    ).reversed())
                    .limit(10)
                    .toList();

        } catch (ApiException e) {

            if (e.getMessage() == null ||
                    !e.getMessage().startsWith("Failed to calculate route:")) {
                throw e;
            }

            log.warn(
                    "Google Routes unavailable. Recalculating all recommendations using geographic proximity."
            );

            // Use the same geographic scoring method for every property.
            ranked = selected.stream()
                    .map(property -> calculateScore(
                            userId,
                            property,
                            preference,
                            weights,
                            false,
                            useServices
                                    ? servicesScores.get(property.getExternalId())
                                    : null,
                            true
                    ))
                    .sorted(Comparator.comparing(
                            PropertyMatchResponseDTO::matchScore
                    ).reversed())
                    .limit(10)
                    .toList();
        }



        // Build a lookup map without fetching property details again
        String cardLang = language != null && language.toLowerCase(Locale.ROOT).startsWith("en") ? "en" : "ar";
        Map<String, PropertyDTO> propertyMap = propertyService.localize(selected, cardLang).stream()
                .collect(Collectors.toMap(
                        PropertyDTO::getExternalId,
                        Function.identity(),
                        (first, second) -> first));



        // Generate AI explanations using the final ranked properties
        Map<String, RecommendationAI.PropertyExplanation> explanations = recommendationAI.explainRecommendations(ranked, selected, preference,language);

        // Keep the list effectively final for the lambda
        final List<PropertyMatchResponseDTO> finalRanked = ranked;

        List<RecommendedPropertyDTO> recommendations = java.util.stream.IntStream.range(0, finalRanked.size())
                .mapToObj(index -> {

                    PropertyMatchResponseDTO score =
                            finalRanked.get(index);

                    PropertyDTO property =
                            propertyMap.get(score.propertyId());

                    RecommendationAI.PropertyExplanation explanation =
                            explanations.get(score.propertyId());

                    String reason = explanation != null &&
                            explanation.reason() != null &&
                            !explanation.reason().isBlank()
                            ? explanation.reason()
                            : language != null && language.toLowerCase(Locale.ROOT).startsWith("en")
                            ? "An analysis is currently unavailable for this property."
                            : "ما توفر تحليل لهذا العقار حاليًا.";
                    String tradeOff = explanation != null &&
                            explanation.tradeOff() != null &&
                            !explanation.tradeOff().isBlank()
                            ? explanation.tradeOff()
                            : null;

                    return new RecommendedPropertyDTO(index + 1, score.propertyId(), score.source(), property.getTitle(), property.getCityName() != null ? property.getCityName() : property.getCity(), property.getNeighborhood(), property.getPrice(), property.getBedrooms(), property.getAreaSqm(), property.getImage(), property.getListingUrl(), score.matchScore(), score.housingScore(), score.commuteScore(), score.servicesScore(), reason, tradeOff);}).toList();

        return new SmartRecommendationResponseDTO(recommendations);
    }

    // Calculate nearby services suitability based on user interests
    private Double calculateNeighborhoodServicesScore(Double latitude, Double longitude, HousingPreference preference) {

        Map<String, ServiceTarget> nearbyTypes = new LinkedHashMap<>();

        // Basic services
        nearbyTypes.put("supermarket", new ServiceTarget("supermarket", 1500.0));
        nearbyTypes.put("pharmacy", new ServiceTarget("pharmacy", 2000.0));
        nearbyTypes.put("hospital", new ServiceTarget("hospital", 5000.0));

        List<LifestyleInterest> textInterests = new ArrayList<>();

        List<LifestyleInterest> interests =
                lifestyleInterestRepository.findByHousingPreference_Id(
                        preference.getId()
                );

        for (LifestyleInterest interest : interests) {

            if (!Boolean.TRUE.equals(interest.getActive())) {
                continue;
            }

            if (interest.getSearchType() == LifestyleInterest.SearchType.NEARBY) {

                String type = interest.getGooglePlaceType();

                if (type == null || type.isBlank()) {
                    continue;
                }

                nearbyTypes.putIfAbsent(type, new ServiceTarget(type, getServiceRadius(type)));

            } else if (interest.getSearchType() == LifestyleInterest.SearchType.TEXT) {
                textInterests.add(interest);
            }
        }

        try {
            int available = 0;
            int total = nearbyTypes.size() + textInterests.size();

            if (!nearbyTypes.isEmpty()) {

                double maxRadius = nearbyTypes.values().stream()
                        .mapToDouble(ServiceTarget::radius)
                        .max()
                        .orElse(2000.0);

                GooglePlacesResponseDTO batch =
                        placePreferenceService.getNearbyServicesBatch(
                                latitude,
                                longitude,
                                new ArrayList<>(nearbyTypes.keySet()),
                                maxRadius
                        );

                if (batch == null || batch.places() == null) {
                    return null;
                }

                for (ServiceTarget target : nearbyTypes.values()) {

                    boolean found = batch.places().stream()
                            .anyMatch(place ->
                                    matchesType(place, target.type()) &&
                                            place.location() != null &&
                                            place.location().latitude() != null &&
                                            place.location().longitude() != null &&
                                            propertyService.calculateDistanceKm(
                                                    latitude,
                                                    longitude,
                                                    place.location().latitude(),
                                                    place.location().longitude()
                                            ) * 1000 <= target.radius()
                            );


                    // Individual Google Places verification disabled for demo
                    // to reduce API requests and quota consumption.
                    // The batch result is used for service scoring.

                    // Verify a missing type separately
//                    if (!found) {
//
//                        GooglePlacesResponseDTO individual = placePreferenceService.getNearbyServices(latitude, longitude, target.type(), target.radius());
//
//                        if (individual == null || individual.places() == null) {
//                            return null;
//                        }
//
//                        found = individual.places().stream().anyMatch(place -> matchesType(place, target.type()));
//                    }

                    if (found) {
                        available++;
                    }
                }
            }

            // Text searches are only made for selected text interests
            for (LifestyleInterest interest : textInterests) {

                double radius = getInterestRadius(interest.getCategory());

                GooglePlacesResponseDTO response = placePreferenceService.getNearbyServicesForInterest(latitude, longitude, interest, radius);

                if (response == null || response.places() == null) {
                    return null;
                }

                if (!response.places().isEmpty()) {
                    available++;
                }
            }

            if (total == 0) {
                return null;
            }

            return Math.round(
                    (available * 100.0 / total) * 100.0
            ) / 100.0;

        } catch (RuntimeException e) {
            log.warn("Nearby services calculation failed: {}", e.getMessage());
            return null;
        }
    }


    private record ServiceTarget(String type, Double radius) { }

    private boolean matchesType(GooglePlacesResponseDTO.Place place, String type) {

        return type.equals(place.primaryType()) || (place.types() != null && place.types().contains(type));
    }

    private double getServiceRadius(String type) {

        return switch (type) {

            case "supermarket", "cafe", "bakery",
                 "atm", "laundry" -> 1500.0;

            case "pharmacy", "gym", "park",
                 "restaurant", "bank", "bus_station",
                 "playground" -> 2000.0;

            case "hospital", "university",
                 "secondary_school", "primary_school",
                 "preschool", "school",
                 "subway_station" -> 5000.0;

            default -> 3000.0;
        };
    }

    private double getInterestRadius(String category) {

        if (category == null) {
            return 3000.0;
        }

        return switch (category.toUpperCase(Locale.ROOT)) {
            case "EDUCATION", "HEALTH", "TRANSPORT" -> 5000.0;
            case "SHOPPING", "SERVICES", "FOOD", "NATURE" -> 2000.0;
            default -> 3000.0;};
    }

    // Calculate scores using existing property data
    private PropertyMatchResponseDTO calculateScore(
            Integer userId,
            PropertyDTO property,
            HousingPreference preference,
            RecommendationWeightsDTO weights,
            boolean includePlaces,
            Double precomputedServicesScore,
            boolean geographicFallback) {

        if (property == null || property.getLatitude() == null ||
                property.getLongitude() == null || property.getPrice() == null || property.getPrice() <= 0) {
            throw new ApiException("Property has insufficient data for matching");
        }

        if (preference.getMaxBudget() == null || preference.getMaxBudget().doubleValue() <= 0) {
            throw new ApiException("Housing budget is invalid");
        }

        // Default weights
        int housingWeight = 40;
        int commuteWeight = 40;
        int servicesWeight = 20;

        if (weights != null) {
            if (weights.housingWeight() == null || weights.commuteWeight() == null || weights.servicesWeight() == null) {
                throw new ApiException("All recommendation weights are required");
            }

            housingWeight = weights.housingWeight();
            commuteWeight = weights.commuteWeight();
            servicesWeight = weights.servicesWeight();

            if (housingWeight < 0 || commuteWeight < 0 || servicesWeight < 0 || housingWeight > 100 || commuteWeight > 100 ||
                    servicesWeight > 100 || housingWeight + commuteWeight + servicesWeight != 100) {
                throw new ApiException("Recommendation weights must total 100");
            }
        }

        // Calculate housing score
        double budget = preference.getMaxBudget().doubleValue();

        double budgetScore = property.getPrice() <= budget
                ? 100.0
                : (budget / property.getPrice()) * 100.0;

        double housingScore = budgetScore * 0.50;

        if (property.getPropertyType() != null && property.getPropertyType().equalsIgnoreCase(preference.getPropertyType())) {
            housingScore += 20;
        }

        if (property.getListingType() != null && property.getListingType().equalsIgnoreCase(preference.getListingType())) {
            housingScore += 15;
        }

        if (property.getCity() != null && property.getCity().equalsIgnoreCase(preference.getCity())) {
            housingScore += 10;
        }

        if (preference.getDistrict() == null || preference.getDistrict().isBlank() ||
                (property.getNeighborhood() != null && property.getNeighborhood().equalsIgnoreCase(preference.getDistrict()))) {
            housingScore += 5;
        }
        // Adjust housing suitability based on household size and bedrooms
        // Evaluate bedroom suitability based on household size
        Integer occupantsCount = preference.getOccupantsCount();
        Integer bedrooms = property.getBedrooms();

        if (occupantsCount != null && occupantsCount > 0
                && bedrooms != null && bedrooms > 0) {

            int minimumBedrooms = (int) Math.ceil(occupantsCount / 2.0);

            if (bedrooms < minimumBedrooms) {
                int missingBedrooms = minimumBedrooms - bedrooms;
                housingScore -= Math.min(15, missingBedrooms * 5);
            } else {
                int extraBedrooms = bedrooms - minimumBedrooms;

                // Extra rooms are not necessarily a disadvantage
                if (extraBedrooms > 2) {
                    housingScore -= Math.min(6, (extraBedrooms - 2) * 2);
                }
            }

            housingScore = Math.max(0, housingScore);
        }

        // Commute analysis is optional when the user has no important locations.
        // Commute analysis with geographic fallback.
        Double commuteScore = null;

        if (!placePreferenceRepository
                .findPlacePreferencesByUser_Id(userId)
                .isEmpty()) {

            if (geographicFallback) {

                // Google Routes failed: use geographic proximity instead.
                commuteScore =
                        placePreferenceService.calculateGeographicProximityScore(
                                userId,
                                property.getLatitude(),
                                property.getLongitude()
                        );

            } else {

                // Normal mode: use Google Routes.
                CommuteSummaryResponseDTO commute =
                        placePreferenceService.getCommuteAnalysis(
                                userId,
                                property.getLatitude(),
                                property.getLongitude()
                        );

                commuteScore = commute.commuteScore();
            }
        }

        // Use precomputed services when available
        Double servicesScore = precomputedServicesScore;

        if (servicesScore == null && includePlaces && !Boolean.FALSE.equals(preference.getIncludeNearbyServices())) {

            servicesScore = calculateNeighborhoodServicesScore(property.getLatitude(), property.getLongitude(), preference);
        }



        // Redistribute weights across available factors only.
        double weightedSum = housingScore * housingWeight;
        int totalWeight = housingWeight;

        if (commuteScore != null) {
            weightedSum += commuteScore * commuteWeight;
            totalWeight += commuteWeight;
        }

        if (servicesScore != null) {
            weightedSum += servicesScore * servicesWeight;
            totalWeight += servicesWeight;
        }

        double matchScore = totalWeight == 0
                ? housingScore
                : weightedSum / totalWeight;

        // Round calculated scores
        housingScore = Math.round(housingScore * 100.0) / 100.0;

        if (commuteScore != null) {
            commuteScore = Math.round(commuteScore * 100.0) / 100.0;
        }

        matchScore = Math.round(matchScore * 100.0) / 100.0;

        if (servicesScore != null) {
            servicesScore = Math.round(servicesScore * 100.0) / 100.0;
        }

        return new PropertyMatchResponseDTO(property.getExternalId(), property.getSource(), property.getTitle(), matchScore, housingScore, commuteScore, servicesScore);
    }

    private PropertyMatchResponseDTO calculateScore(
            Integer userId,
            PropertyDTO property,
            HousingPreference preference,
            RecommendationWeightsDTO weights,
            boolean includePlaces,
            Double precomputedServicesScore) {

        return calculateScore(
                userId,
                property,
                preference,
                weights,
                includePlaces,
                precomputedServicesScore,
                false
        );
    }

}
