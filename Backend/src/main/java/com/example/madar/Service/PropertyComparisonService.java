package com.example.madar.Service;



import com.example.madar.AI.RecommendationAI;
import com.example.madar.Api.ApiException;
import com.example.madar.DTO.Out.Property.PropertyDTO;
import com.example.madar.DTO.Out.Recommendation.ComparedPropertyDTO;
import com.example.madar.DTO.Out.Recommendation.ComparisonExplanationDTO;
import com.example.madar.DTO.Out.Recommendation.PropertyComparisonResultDTO;
import com.example.madar.DTO.Out.Recommendation.PropertyMatchResponseDTO;
import com.example.madar.Model.HousingPreference;
import com.example.madar.Model.PropertyComparison;
import com.example.madar.Model.SavedProperty;
import com.example.madar.Model.User;
import com.example.madar.Repository.HousingPreferenceRepository;
import com.example.madar.Repository.PropertyComparisonRepository;
import com.example.madar.Repository.SavedPropertyRepository;
import com.example.madar.Repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PropertyComparisonService {

    private final PropertyComparisonRepository comparisonRepository;
    private final UserRepository userRepository;
    private final RecommendationService recommendationService;
    private final HousingPreferenceRepository housingPreferenceRepository;
    private final RecommendationAI recommendationAI;
    private final PropertyService propertyService;
    private final SavedPropertyRepository savedPropertyRepository;
    private final CreditService creditService;




    //CRUD METHODS
    // GET ALL
    public List<PropertyComparison> getAllComparisons() {
        return comparisonRepository.findAll();
    }

    // GET BY USER ID
    public List<PropertyComparison> getComparisonsByUserId(Integer userId) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        return comparisonRepository.findPropertyComparisonsByUser_Id(userId);
    }

    // GET BY ID
    public PropertyComparison getComparisonById(Integer userId, Integer comparisonId) {

        PropertyComparison comparison =
                comparisonRepository.findPropertyComparisonByIdAndUser_Id(comparisonId, userId);

        if (comparison == null) {
            throw new ApiException("Comparison not found for this user");
        }

        return comparison;
    }

    // ADD
    public void addComparison(Integer userId, PropertyComparison comparison) {

        User user = userRepository.findUserById(userId);
        if (user == null) {
            throw new ApiException("User not found");
        }

        validateComparison(userId, comparison, null);

        comparison.setUser(user);
        comparisonRepository.save(comparison);
    }

    // UPDATE
    public void updateComparison(Integer userId, Integer comparisonId,
                                 PropertyComparison updatedComparison) {

        PropertyComparison comparison =
                comparisonRepository.findPropertyComparisonByIdAndUser_Id(comparisonId, userId);

        if (comparison == null) {
            throw new ApiException("Comparison not found for this user");
        }

        validateComparison(userId, updatedComparison, comparisonId);

        comparison.setFirstPropertyId(updatedComparison.getFirstPropertyId());
        comparison.setFirstPropertySource(updatedComparison.getFirstPropertySource());
        comparison.setSecondPropertyId(updatedComparison.getSecondPropertyId());
        comparison.setSecondPropertySource(updatedComparison.getSecondPropertySource());

        comparisonRepository.save(comparison);
    }

    // DELETE
    public void deleteComparison(Integer userId, Integer comparisonId) {

        PropertyComparison comparison =
                comparisonRepository.findPropertyComparisonByIdAndUser_Id(comparisonId, userId);

        if (comparison == null) {
            throw new ApiException("Comparison not found for this user");
        }

        comparisonRepository.delete(comparison);
    }


    //extra endpoint


    // Compare two properties directly without saving them
    public PropertyComparisonResultDTO compareTwoProperties(Integer userId, String firstSource, String firstPropertyId, String secondSource, String secondPropertyId,String language) {

        if (firstSource == null || secondSource == null || firstPropertyId == null || secondPropertyId == null ||
                firstSource.isBlank() || secondSource.isBlank() || firstPropertyId.isBlank() || secondPropertyId.isBlank()) {
            throw new ApiException("Both property IDs and sources are required");
        }

        if (firstSource.equalsIgnoreCase(secondSource) && firstPropertyId.equals(secondPropertyId)) {
            throw new ApiException("Cannot compare a property with itself");
        }

        HousingPreference preference = getHousingPreference(userId);

        PropertyDTO firstProperty = propertyService.getPropertyById(firstSource, firstPropertyId);

        PropertyDTO secondProperty = propertyService.getPropertyById(secondSource, secondPropertyId);

        List<ComparedPropertyDTO> compared = new ArrayList<>();

        compared.add(calculateComparedProperty(userId, firstProperty, null));
        compared.add(calculateComparedProperty(userId, secondProperty, null));

        return buildComparisonResult(compared, preference,language);
    }


    // Compare selected saved properties with AI analysis
    public PropertyComparisonResultDTO compareMultipleProperties(Integer userId, List<Integer> savedPropertyIds,String language) {

        HousingPreference preference = getHousingPreference(userId);

        List<ComparedPropertyDTO> compared = compareSavedProperties(userId, savedPropertyIds);

        return buildComparisonResult(compared, preference,language);
    }



    // Compare two properties and charge 10 credits
    public PropertyComparisonResultDTO compareTwoPropertiesWithCredits(
            Integer userId,
            String firstSource,
            String firstPropertyId,
            String secondSource,
            String secondPropertyId,
            String language) {

        String operationId = UUID.randomUUID().toString();

        creditService.reserveCredits(userId, "AI_COMPARISON", operationId);

        try {
            PropertyComparisonResultDTO response = compareTwoProperties(
                    userId,
                    firstSource,
                    firstPropertyId,
                    secondSource,
                    secondPropertyId,
                    language
            );

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


    // Compare saved properties and charge 10 credits
    public PropertyComparisonResultDTO compareMultiplePropertiesWithCredits(
            Integer userId,
            List<Integer> savedPropertyIds,
            String language) {

        String operationId = UUID.randomUUID().toString();

        creditService.reserveCredits(userId, "AI_COMPARISON", operationId);

        try {
            PropertyComparisonResultDTO response =
                    compareMultipleProperties(userId, savedPropertyIds, language);

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


    //Helper methods
    private void validateComparison(Integer userId, PropertyComparison comparison, Integer comparisonId) {

        // Get the properties' IDs and sources
        String firstId = comparison.getFirstPropertyId();
        String secondId = comparison.getSecondPropertyId();
        String firstSource = comparison.getFirstPropertySource();
        String secondSource = comparison.getSecondPropertySource();


        // Prevent comparing a property with itself
        if (firstId.equals(secondId) && firstSource.equals(secondSource)) {
            throw new ApiException("Cannot compare a property with itself");
        }


        // Get all saved comparisons for this user
        List<PropertyComparison> comparisons = comparisonRepository.findPropertyComparisonsByUser_Id(userId);


        // Check each saved comparison for duplicates
        for (PropertyComparison savedComparison : comparisons) {

            // During update, skip the comparison being updated
            if (savedComparison.getId().equals(comparisonId)) {
                continue;
            }


            // Check if both comparisons have the same properties in the same order
            // Example: A-B = A-B
            boolean sameOrder = savedComparison.getFirstPropertyId().equals(firstId) && savedComparison.getFirstPropertySource().equals(firstSource) &&
                    savedComparison.getSecondPropertyId().equals(secondId) && savedComparison.getSecondPropertySource().equals(secondSource);


            // Check if both comparisons have the same properties in reverse order
            // Example: A-B = B-A
            boolean reversedOrder = savedComparison.getFirstPropertyId().equals(secondId) && savedComparison.getFirstPropertySource().equals(secondSource) &&
                    savedComparison.getSecondPropertyId().equals(firstId) && savedComparison.getSecondPropertySource().equals(firstSource);


            // Reject the comparison if it already exists in either order
            if (sameOrder || reversedOrder) {
                throw new ApiException("This comparison already exists");
            }
        }
    }


    // Sort properties and generate AI analysis
    private PropertyComparisonResultDTO buildComparisonResult(List<ComparedPropertyDTO> compared, HousingPreference preference,String language) {

        compared.sort(Comparator.comparing(ComparedPropertyDTO::matchScore).reversed());

        ComparisonExplanationDTO aiAnalysis = recommendationAI.explainComparison(compared, preference,language);

        return new PropertyComparisonResultDTO(compared, aiAnalysis);
    }


    // Calculate suitability and prepare a comparison item

    private ComparedPropertyDTO calculateComparedProperty(
            Integer userId,
            PropertyDTO property,
            Integer savedPropertyId) {

        // Calculate the property match without calling Google Places.
        // Services score will be null, and the available scoring
        // weights will be redistributed automatically.
        PropertyMatchResponseDTO score =
                recommendationService.calculateMatchWithoutPlaces(
                        userId,
                        property
                );

        return new ComparedPropertyDTO(
                savedPropertyId,
                property.getExternalId(),
                property.getSource(),
                property.getTitle(),
                property.getNeighborhood(),
                property.getPrice(),
                property.getBedrooms(),
                property.getAreaSqm(),
                property.getImage(),
                property.getListingUrl(),
                score.matchScore(),
                score.housingScore(),
                score.commuteScore(),
                score.servicesScore()
        );
    }




    // Compare selected properties from the user's saved list
    private List<ComparedPropertyDTO> compareSavedProperties(Integer userId, List<Integer> savedPropertyIds) {

        if (savedPropertyIds == null || savedPropertyIds.size() < 2 || savedPropertyIds.size() > 4 || savedPropertyIds.contains(null) ||
                new HashSet<>(savedPropertyIds).size() != savedPropertyIds.size()) {
            throw new ApiException("Choose 2 to 4 different saved properties");
        }

        List<ComparedPropertyDTO> compared = new ArrayList<>();

        for (Integer savedPropertyId : savedPropertyIds) {

            SavedProperty savedProperty = savedPropertyRepository.findSavedPropertyByIdAndUser_Id(savedPropertyId, userId);

            if (savedProperty == null) {
                throw new ApiException("Saved property not found for this user: " + savedPropertyId);
            }

            PropertyDTO property = propertyService.getPropertyById(savedProperty.getSource(), savedProperty.getExternalPropertyId());

            compared.add(calculateComparedProperty(userId, property, savedProperty.getId()));
        }

        return compared;
    }

    // Retrieve and validate housing preferences
    private HousingPreference getHousingPreference(Integer userId) {

        HousingPreference preference = housingPreferenceRepository.findHousingPreferenceByUser_Id(userId);

        if (preference == null) {
            throw new ApiException("Housing preferences not found");
        }

        return preference;
    }

}
