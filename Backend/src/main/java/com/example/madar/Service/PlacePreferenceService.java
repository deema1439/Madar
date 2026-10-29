package com.example.madar.Service;

import com.example.madar.Api.ApiException;
import com.example.madar.Client.GooglePlacesClient;
import com.example.madar.DTO.Out.Commute.CommuteSummaryResponseDTO;
import com.example.madar.DTO.Out.GooglePlaces.GooglePlacesResponseDTO;
import com.example.madar.DTO.Out.PlacePreference.PlacePreferenceSummaryDTO;
import com.example.madar.Model.LifestyleInterest;
import com.example.madar.Model.PlacePreference;
import com.example.madar.Model.User;
import com.example.madar.Repository.PlacePreferenceRepository;
import com.example.madar.Repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import com.example.madar.Client.GoogleRoutesClient;
import com.example.madar.DTO.Out.Commute.CommuteResponseDTO;
import com.example.madar.DTO.Out.GoogleRoutes.GoogleRouteResponseDTO;

import java.util.*;

import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class PlacePreferenceService {

    public static final Set<String> SUPPORTED_PLACE_TYPES = Set.of(
            "supermarket", "pharmacy", "hospital",
            "school", "preschool", "primary_school",
            "secondary_school", "university",
            "gym", "dentist", "park", "playground",
            "restaurant", "cafe", "bakery",
            "shopping_mall", "furniture_store",
            "subway_station", "bus_station",
            "bank", "atm", "laundry", "gas_station"
    );
    private final PlacePreferenceRepository placePreferenceRepository;
    private final UserRepository userRepository;
    private final GoogleRoutesClient googleRoutesClient;
    private final GooglePlacesClient googlePlacesClient;
    private final PropertyService propertyService;
    private final CreditService creditService;


    //get Places for User
public List<PlacePreference>getMyPlaces(Integer userId){
    User user=userRepository.findUserById(userId);
    if(user==null){
        throw new ApiException("User not found");
    }
    List<PlacePreference>userPlaces=placePreferenceRepository.findPlacePreferencesByUser_Id(userId);

    return userPlaces;
}


//Post places

    public void addPlace(Integer userId, PlacePreference placePreference){
    User user=userRepository.findUserById(userId);
    if(user==null){
        throw new ApiException("User not found");
    }
        placePreference.setId(null);
        placePreference.setUser(user);
        placePreferenceRepository.save(placePreference);
    }


    //update place

    public void updatePlace(Integer userId, Integer placeId, PlacePreference updated){
        PlacePreference oldPlace = placePreferenceRepository.findPlacePreferenceById(placeId);
        if(oldPlace == null){
            throw new ApiException("Place not found");
        }
        if(!oldPlace.getUser().getId().equals(userId)){
            throw new ApiException("You are not authorized to update this place");
        }
        oldPlace.setName(updated.getName());
        oldPlace.setType(updated.getType());
        oldPlace.setLatitude(updated.getLatitude());
        oldPlace.setLongitude(updated.getLongitude());
        oldPlace.setImportance(updated.getImportance());
        oldPlace.setVisitPerWeek(updated.getVisitPerWeek());
        placePreferenceRepository.save(oldPlace);
    }



    public void deletePlace(Integer userId, Integer placeId){
        PlacePreference place = placePreferenceRepository.findPlacePreferenceById(placeId);
        if(place == null){
            throw new ApiException("Place not found");
        }
        if(!place.getUser().getId().equals(userId)){
            throw new ApiException("You are not authorized to delete this place");
        }
        placePreferenceRepository.delete(place);
    }


    //update importance only
    public void updateImportance(Integer userId, Integer placeId, Integer importance){
        PlacePreference place = placePreferenceRepository.findPlacePreferenceById(placeId);
        if(place == null){
            throw new ApiException("Place not found");
        }
        if(!place.getUser().getId().equals(userId)){
            throw new ApiException("You are not authorized to update this place");
        }
        if(importance<1||importance>5){
            throw new ApiException("Importance must be between 1 and 5");
        }
        place.setImportance(importance);
        placePreferenceRepository.save(place);
    }


    //extra endpoints


    // Analyze property commute suitability based on the user's important places
    public CommuteSummaryResponseDTO getCommuteAnalysis(Integer userId, Double propertyLat, Double propertyLng) {

        // Get driving distance and duration for each saved place from Google Routes
        List<CommuteResponseDTO> commutes = calculateCommutes(userId, propertyLat, propertyLng);

        // Store the total estimated weekly travel time
        double totalWeeklyMinutes = 0;

        // Store the sum of place scores multiplied by their weights
        double weightedScoreSum = 0;

        // Store the sum of all place weights
        double totalWeight = 0;

        for (CommuteResponseDTO commute : commutes) {

            // Estimate weekly travel time:
            // One-way duration * weekly visits * 2 (round trip)
            totalWeeklyMinutes += commute.durationMinutes() * commute.visitPerWeek() * 2;

            // Calculate each place's accessibility score from 0 to 100:
            // 15 minutes or less = 100 points
            // Between 15 and 75 minutes = score decreases gradually
            // 75 minutes or more = 0 points
            double placeScore = Math.max(0, Math.min(100, 100 - (commute.durationMinutes() - 15) * (100.0 / 60.0)));

            // Calculate place weight based on importance and visit frequency
            // Frequently visited and important places have a greater impact
            double weight = commute.importance() * commute.visitPerWeek();

            // Add the weighted accessibility score
            weightedScoreSum += placeScore * weight;

            // Add the current place weight to the total
            totalWeight += weight;
        }

        // Prevent division by zero when all place weights are invalid or zero
        if (totalWeight <= 0) {
            throw new ApiException("Cannot calculate commute score without valid place weights");
        }

        // Round estimated weekly travel time to one decimal place
        double weeklyMinutes = Math.round(totalWeeklyMinutes * 10.0) / 10.0;

        // Convert weekly minutes to hours and round to two decimal places
        double weeklyHours = Math.round((weeklyMinutes / 60.0) * 100.0) / 100.0;

        // Calculate the final weighted commute score (0-100)
        // Higher scores indicate better accessibility for this user's priorities
        double commuteScore = Math.round((weightedScoreSum / totalWeight) * 100.0) / 100.0;

        // Return detailed routes, estimated weekly time, and commute score
        return new CommuteSummaryResponseDTO(commutes, weeklyMinutes, weeklyHours, commuteScore);
    }



    // Search one Google place type with verified distances
    public GooglePlacesResponseDTO getNearbyServices(Double latitude, Double longitude, String placeType, Double radiusMeters) {

        validateSearchLocation(latitude, longitude, radiusMeters);

        if (placeType == null || !SUPPORTED_PLACE_TYPES.contains(placeType)) {
            throw new ApiException("Unsupported Google place type");
        }

        GooglePlacesResponseDTO response = googlePlacesClient.searchNearbyPlaces(latitude, longitude, placeType, radiusMeters);

        return filterPlacesByDistance(response, latitude, longitude, radiusMeters);
    }


    // Get important locations summary
    public PlacePreferenceSummaryDTO getPlacesSummary(Integer userId) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        List<PlacePreference> places = placePreferenceRepository.findPlacePreferencesByUser_Id(userId);

        Map<String, Long> countByType = places.stream().collect(Collectors.groupingBy(PlacePreference::getType, Collectors.counting()));

        return new PlacePreferenceSummaryDTO(places.size(), countByType);
    }


    // Search several Google place types in one request
    public GooglePlacesResponseDTO getNearbyServicesBatch(Double latitude, Double longitude, List<String> placeTypes, Double radiusMeters) {

        validateSearchLocation(latitude, longitude, radiusMeters);

        if (placeTypes == null || placeTypes.isEmpty()) {
            return new GooglePlacesResponseDTO(List.of());
        }

        List<String> types = new LinkedHashSet<>(placeTypes)
                .stream()
                .toList();

        if (types.stream().anyMatch(type -> type == null || !SUPPORTED_PLACE_TYPES.contains(type))) {
            throw new ApiException("Unsupported Google place type");
        }

        if (types.size() > 50) {
            throw new ApiException("Maximum 50 place types are allowed");
        }

        GooglePlacesResponseDTO response = googlePlacesClient.searchNearbyPlacesBatch(latitude, longitude, types, radiusMeters);

        return filterPlacesByDistance(response, latitude, longitude, radiusMeters);
    }


    // Search using the user's configured lifestyle interest
    public GooglePlacesResponseDTO getNearbyServicesForInterest(Double latitude, Double longitude, LifestyleInterest interest, Double radiusMeters) {

        validateSearchLocation(latitude, longitude, radiusMeters);

        if (interest == null || !Boolean.TRUE.equals(interest.getActive())) {
            throw new ApiException("Invalid lifestyle interest");
        }

        if (interest.getSearchType() == null) {
            throw new ApiException("Interest search type is required");
        }

        if (interest.getSearchType() == LifestyleInterest.SearchType.NEARBY) {

            return getNearbyServices(latitude, longitude, interest.getGooglePlaceType(), radiusMeters);
        }

        if (interest.getSearchType() == LifestyleInterest.SearchType.TEXT) {

            if (interest.getSearchQuery() == null || interest.getSearchQuery().isBlank()) {
                throw new ApiException("Interest search query is required");
            }

            GooglePlacesResponseDTO response = googlePlacesClient.searchPlacesByText(latitude, longitude, interest.getSearchQuery(), radiusMeters);

            return filterPlacesByDistance(response, latitude, longitude, radiusMeters);
        }

        throw new ApiException("Unsupported interest search type");
    }



    // Generate a paid commute report using credits
    public CommuteSummaryResponseDTO getCommuteAnalysisWithCredits(
            Integer userId,
            Double latitude,
            Double longitude) {

        String operationId = UUID.randomUUID().toString();

        // Reserve 20 credits
        creditService.reserveCredits(userId, "COMMUTE_REPORT", operationId);

        try {
            // Run the original commute analysis
            CommuteSummaryResponseDTO response =
                    getCommuteAnalysis(userId, latitude, longitude);

            // Confirm credit deduction
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



    //Helper Method

    private void validateSearchLocation(Double latitude, Double longitude, Double radiusMeters) {

        if (latitude == null || longitude == null ||
                !Double.isFinite(latitude) || !Double.isFinite(longitude) ||
                latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {

            throw new ApiException("Invalid location coordinates");
        }

        if (radiusMeters == null || !Double.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {

            throw new ApiException("Invalid search radius");
        }
    }


    private GooglePlacesResponseDTO filterPlacesByDistance(GooglePlacesResponseDTO response, Double latitude, Double longitude, Double radiusMeters) {

        if (response == null || response.places() == null) {
            return new GooglePlacesResponseDTO(List.of());
        }

        List<GooglePlacesResponseDTO.Place> places =
                response.places().stream()
                        .filter(Objects::nonNull)
                        .filter(place ->
                                place.location() != null &&
                                        place.location().latitude() != null &&
                                        place.location().longitude() != null &&
                                        Double.isFinite(place.location().latitude()) &&
                                        Double.isFinite(place.location().longitude())
                        )
                        .map(place -> {

                            double distanceKm = propertyService.calculateDistanceKm(latitude, longitude, place.location().latitude(), place.location().longitude());

                            if (distanceKm * 1000 > radiusMeters) {
                                return null;
                            }

                            return new GooglePlacesResponseDTO.Place(
                                    place.id(),
                                    place.displayName(),
                                    place.formattedAddress(),
                                    place.location(),
                                    place.primaryType(),
                                    place.types(),
                                    Math.round(distanceKm * 100.0) / 100.0
                            );
                        })
                        .filter(Objects::nonNull)
                        .toList();

        return new GooglePlacesResponseDTO(places);
    }

    // Calculate driving distance and duration from a property to user's places
    private List<CommuteResponseDTO> calculateCommutes(Integer userId, Double propertyLat, Double propertyLng) {

        // Check if user exists
        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        // Validate property coordinates
        if (propertyLat == null || propertyLng == null ||
                !Double.isFinite(propertyLat) || !Double.isFinite(propertyLng) ||
                propertyLat < -90 || propertyLat > 90 ||
                propertyLng < -180 || propertyLng > 180) {
            throw new ApiException("Invalid property coordinates");
        }

        // Get user's important places
        List<PlacePreference> places = placePreferenceRepository.findPlacePreferencesByUser_Id(userId);

        if (places.isEmpty()) {
            throw new ApiException("No important places found for this user");
        }

        List<CommuteResponseDTO> results = new ArrayList<>();

        for (PlacePreference place : places) {

            // Calculate the route using Google Routes API
            GoogleRouteResponseDTO.Route route = googleRoutesClient.computeRoute(
                    propertyLat,
                    propertyLng,
                    place.getLatitude(),
                    place.getLongitude()
            );

            // Convert meters to kilometers
            double distanceKm = route.distanceMeters() / 1000.0;

            // Convert duration from seconds to minutes
            double durationSeconds = Double.parseDouble(route.duration().replace("s", ""));

            double durationMinutes = durationSeconds / 60.0;

            // Round to one decimal place
            distanceKm = Math.round(distanceKm * 10.0) / 10.0;
            durationMinutes = Math.round(durationMinutes * 10.0) / 10.0;

            // Prepare commute result
            results.add(new CommuteResponseDTO(
                    place.getId(),
                    place.getName(),
                    place.getType(),
                    place.getImportance(),
                    place.getVisitPerWeek(),
                    distanceKm,
                    durationMinutes));
        }

        return results;
    }

    // Fallback score based on geographic proximity, without Google Routes.
    public Double calculateGeographicProximityScore(
            Integer userId,
            Double propertyLat,
            Double propertyLng) {

        List<PlacePreference> places =
                placePreferenceRepository.findPlacePreferencesByUser_Id(userId);

        if (places.isEmpty()) {
            return null;
        }

        double weightedSum = 0;
        double totalWeight = 0;

        for (PlacePreference place : places) {

            if (place.getLatitude() == null
                    || place.getLongitude() == null
                    || place.getImportance() == null
                    || place.getVisitPerWeek() == null) {
                continue;
            }

            double weight =
                    place.getImportance() * place.getVisitPerWeek();

            if (weight <= 0) {
                continue;
            }

            double distanceKm = propertyService.calculateDistanceKm(
                    propertyLat,
                    propertyLng,
                    place.getLatitude(),
                    place.getLongitude()
            );

            // Geographic proximity, not driving time.
            // 2 km or less = 100, 20 km or more = 0.
            double score = Math.max(
                    0,
                    Math.min(
                            100,
                            100 - (distanceKm - 2) * (100.0 / 18.0)
                    )
            );

            weightedSum += score * weight;
            totalWeight += weight;
        }

        if (totalWeight <= 0) {
            return null;
        }

        return Math.round(
                (weightedSum / totalWeight) * 100.0
        ) / 100.0;
    }

}
