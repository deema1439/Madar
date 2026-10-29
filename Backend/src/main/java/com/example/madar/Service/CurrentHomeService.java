package com.example.madar.Service;


import com.example.madar.Api.ApiException;
import com.example.madar.Client.GooglePlacesClient;
import com.example.madar.DTO.Out.CurrentHome.CurrentHomeStatusDTO;
import com.example.madar.DTO.Out.GooglePlaces.GooglePlacesResponseDTO;
import com.example.madar.DTO.Out.GooglePlaces.NearbyPlaceResponseDTO;
import com.example.madar.DTO.Out.GooglePlaces.NearbyInterestResponseDTO;
import com.example.madar.DTO.Out.GooglePlaces.NeighborhoodResponseDTO;
import com.example.madar.Model.CurrentHome;
import com.example.madar.Model.User;
import com.example.madar.Repository.CurrentHomeRepository;
import com.example.madar.Repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CurrentHomeService {

    private final CurrentHomeRepository currentHomeRepository;
    private final UserRepository userRepository;
    private final PlacePreferenceService placePreferenceService;
    private final GooglePlacesClient googlePlacesClient;
    private final PropertyService propertyService;
    private final HousingPreferenceService housingPreferenceService;
    private final NearbyInterestService nearbyInterestService;

    //CRUD METHOD
    public List<CurrentHome> getAllCurrentHomes() {
        return currentHomeRepository.findAll();
    }

    //My current home
    public CurrentHome getCurrentHomeByUserId(Integer userId) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        CurrentHome currentHome = currentHomeRepository.findCurrentHomeByUser_Id(userId);
        if (currentHome == null) {
            throw new ApiException("Current home not found for this user");
        }

        return currentHome;
    }


    //add current home
    public void addCurrentHome(Integer userId, CurrentHome currentHome) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        CurrentHome existingHome = currentHomeRepository.findCurrentHomeByUser_Id(userId);
        if (existingHome != null) {
            throw new ApiException("User already has a current home");
        }

        if (!validCoordinates(currentHome.getLatitude(), currentHome.getLongitude())) {
            throw new ApiException("Invalid current home coordinates");
        }

        currentHome.setId(null);
        currentHome.setMovedInAt(null);
        currentHome.setConfirmedByUserAt(null);
        currentHome.setUser(user);

        currentHomeRepository.save(currentHome);
    }

    //update current home
    public void updateCurrentHome(Integer userId, Integer homeId, CurrentHome updatedHome) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        CurrentHome currentHome = currentHomeRepository.findCurrentHomeById(homeId);
        if (currentHome == null) {
            throw new ApiException("Current home not found");
        }

        if (!currentHome.getUser().getId().equals(userId)) {
            throw new ApiException("This home does not belong to the user");
        }



        if (!validCoordinates(updatedHome.getLatitude(), updatedHome.getLongitude())) {
            throw new ApiException("Invalid current home coordinates");
        }

        currentHome.setLatitude(updatedHome.getLatitude());
        currentHome.setLongitude(updatedHome.getLongitude());
        currentHome.setExternalPropertyId(updatedHome.getExternalPropertyId());
        currentHome.setSource(updatedHome.getSource());

        // A new home does not inherit the previous move confirmation
        currentHome.setMovedInAt(null);
        currentHome.setConfirmedByUserAt(null);

        currentHomeRepository.save(currentHome);
    }


    //delete current home
    @Transactional
    public void deleteCurrentHome(Integer userId, Integer homeId) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        CurrentHome currentHome =
                currentHomeRepository.findCurrentHomeById(homeId);

        if (currentHome == null) {
            throw new ApiException("Current home not found");
        }

        if (!currentHome.getUser().getId().equals(userId)) {
            throw new ApiException("This home does not belong to the user");
        }

        if (user.getCurrentHome() != null
                && user.getCurrentHome().getId().equals(homeId)) {
            user.setCurrentHome(null);
        }

        currentHomeRepository.delete(currentHome);
        currentHomeRepository.flush();
    }
    //extra endpoints

    // Confirm the user's single stored home without changing its other data.
    @Transactional
    public void confirmMove(Integer userId) {
        if (userRepository.findUserForUpdateById(userId) == null) {
            throw new ApiException("User not found");
        }
        CurrentHome home = currentHomeRepository.findHomeForUpdateByUser_Id(userId);
        if (home == null) {
            throw new ApiException("Current home not found for this user");
        }
        if (home.getMovedInAt() == null) {
            home.setMovedInAt(LocalDate.now());
            home.setConfirmedByUserAt(LocalDateTime.now());
            currentHomeRepository.save(home);
        }
    }

    public NeighborhoodResponseDTO getNeighborhood(Integer userId) {

        CurrentHome home = getValidHome(userId);

        List<String> types = List.of(
                "supermarket",
                "pharmacy",
                "hospital"
        );

        GooglePlacesResponseDTO response =
                placePreferenceService.getNearbyServicesBatch(
                        home.getLatitude(),
                        home.getLongitude(),
                        types,
                        5000.0
                );

        Map<String, GooglePlacesResponseDTO.Place> places =
                new LinkedHashMap<>();

        List<NeighborhoodResponseDTO.CategorySummary> categories = new ArrayList<>();

        for (String type : types) {

            List<String> ids = new ArrayList<>();

            double radius = switch (type) {
                case "supermarket" -> 1500.0;
                case "pharmacy" -> 2000.0;
                default -> 5000.0;
            };

            if (response.places() != null) {

                for (GooglePlacesResponseDTO.Place place : response.places()) {

                    if (place == null || place.id() == null
                            || place.location() == null
                            || !validCoordinates(
                            place.location().latitude(),
                            place.location().longitude())) {
                        continue;
                    }

                    boolean matches = type.equals(place.primaryType())
                            || (place.types() != null
                            && place.types().contains(type));

                    double distanceMeters =
                            propertyService.calculateDistanceKm(
                                    home.getLatitude(),
                                    home.getLongitude(),
                                    place.location().latitude(),
                                    place.location().longitude()
                            ) * 1000;

                    if (matches && distanceMeters <= radius) {
                        places.putIfAbsent(place.id(), place);

                        if (!ids.contains(place.id())) {
                            ids.add(place.id());
                        }
                    }
                }
            }

            categories.add(new NeighborhoodResponseDTO.CategorySummary(type, ids.size(), ids));
        }

        return new NeighborhoodResponseDTO(
                home.getId(),
                new GooglePlacesResponseDTO.Location(home.getLatitude(), home.getLongitude()),
                5000, new ArrayList<>(places.values()), categories, false);
    }

    public GooglePlacesResponseDTO getNearbyByCategory(Integer userId, String category, Double radius) {
        CurrentHome home = getValidHome(userId);
        return placePreferenceService.getNearbyServices(home.getLatitude(), home.getLongitude(), category, radius);
    }

    public List<NearbyInterestResponseDTO> getNearestEssential(Integer userId) {
        return getNearestEssential(userId, 2000.0);
    }

    public List<NearbyInterestResponseDTO> getNearestEssential(Integer userId, Double radius) {

        CurrentHome home = getValidHome(userId);

        return nearbyInterestService.analyzeCurrentHome(userId, home.getLatitude(), home.getLongitude(), radius);
    }

    public List<NearbyPlaceResponseDTO> searchNearby(Integer userId, String query, Double radius) {
        CurrentHome home = getValidHome(userId);
        if (query == null || query.isBlank()) {
            throw new ApiException("Search query is required");
        }
        if (radius == null || !Double.isFinite(radius) || radius <= 0 || radius > 50000) {
            throw new ApiException("Invalid search radius");
        }
        GooglePlacesResponseDTO response = googlePlacesClient.searchPlacesByText(
                home.getLatitude(), home.getLongitude(), query.trim(), radius);
        Map<String, NearbyPlaceResponseDTO> results = new LinkedHashMap<>();
        for (GooglePlacesResponseDTO.Place place : response.places()) {
            if (place == null || place.id() == null || place.location() == null
                    || !validCoordinates(place.location().latitude(), place.location().longitude())) {
                continue;
            }
            double distance = propertyService.calculateDistanceKm(home.getLatitude(), home.getLongitude(),
                    place.location().latitude(), place.location().longitude()) * 1000;
            if (distance <= radius) {
                results.putIfAbsent(place.id(), new NearbyPlaceResponseDTO(place, distance));
            }
        }
        return results.values().stream()
                .sorted(Comparator.comparing(NearbyPlaceResponseDTO::straightLineDistanceMeters)).toList();
    }



    // Get the user's current home status
    public CurrentHomeStatusDTO getCurrentHomeStatus(Integer userId) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        CurrentHome currentHome = currentHomeRepository.findCurrentHomeByUser_Id(userId);

        if (currentHome == null) {
            return new CurrentHomeStatusDTO("NO_HOME", null, null);
        }

        if (currentHome.getMovedInAt() == null) {
            return new CurrentHomeStatusDTO("HOME_SET", currentHome.getId(), null);
        }

        return new CurrentHomeStatusDTO("MOVED_IN", currentHome.getId(), currentHome.getMovedInAt());
    }



    //helper methods
    private CurrentHome getValidHome(Integer userId) {

        CurrentHome home = getCurrentHomeByUserId(userId);

        if (!validCoordinates(home.getLatitude(), home.getLongitude())) {
            throw new ApiException("Invalid current home coordinates");
        }

        return home;
    }

    private boolean validCoordinates(Double latitude, Double longitude) {
        return latitude != null && longitude != null && Double.isFinite(latitude) && Double.isFinite(longitude)
                && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }



}
