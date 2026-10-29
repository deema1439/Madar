package com.example.madar.Service;

import com.example.madar.Api.ApiException;
import com.example.madar.Client.MoyasarClient;
import com.example.madar.Client.N8nClient;
import com.example.madar.Config.PaidServiceProperties;
import com.example.madar.DTO.In.Payment.MoyasarWebhookDTO;
import com.example.madar.DTO.Out.Payment.*;
import com.example.madar.Model.CreditPackage;
import com.example.madar.Model.Payment;
import com.example.madar.Model.PlacePreference;
import com.example.madar.Model.User;
import com.example.madar.Repository.CreditPackageRepository;
import com.example.madar.Repository.PaymentRepository;
import com.example.madar.Repository.PlacePreferenceRepository;
import com.example.madar.Repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final UserRepository userRepository;
    private final PlacePreferenceRepository placePreferenceRepository;
    private final CreditPackageRepository creditPackageRepository;
    private final CreditPackageService creditPackageService;
    private final CreditService creditService;
    private final MoyasarClient moyasarClient;
    private final PaidServiceProperties paidServiceProperties;
    private final NotificationService notificationService;
    private final N8nClient n8nClient;

    @Value("${moyasar.callback-url:}")
    private String callbackUrl;

    @Value("${moyasar.webhook-secret:}")
    private String webhookSecret;


    // Create checkout for credit packages or legacy commute report.
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public CheckoutResponseDTO checkout(
            Integer userId,
            String serviceType,
            String checkoutKey
    ) {

        if (serviceType == null || serviceType.isBlank()) {
            throw new ApiException("Payment type is required");
        }

        String type = serviceType.trim().toUpperCase(Locale.ROOT);

        String key = validUuid(
                checkoutKey,
                "Idempotency-Key must be a UUID"
        );

        User user = userRepository.findUserForUpdateById(userId);

        if (user == null) {
            throw new ApiException("User not found");
        }

        // Check an existing checkout BEFORE checking package availability.
        Payment existing = paymentRepository.findPaymentByCheckoutKey(key);

        if (existing != null) {

            if (!existing.getUser().getId().equals(userId)
                    || !existing.getServiceType().equals(type)) {

                throw new ApiException(
                        "Idempotency-Key belongs to a different checkout"
                );
            }

            return resumeCheckout(existing);
        }

        // Only new checkouts require an active package.
        type = normalizeType(type);

        validateCheckoutConfiguration();

        Payment payment = new Payment();
        payment.setUser(user);
        payment.setServiceType(type);
        payment.setRefundedCredits(0);

        if ("COMMUTE_REPORT".equals(type)) {

            PaidServiceProperties.Definition definition =
                    serviceDefinition(type);

            validateCommuteInputs(userId);

            if (findAccess(userId, type).access()) {
                throw new ApiException("Access to this service is already active");
            }

            payment.setAmount(definition.getAmountHalalas());
            payment.setCurrency(definition.getCurrency());
            payment.setAccessDurationHours(definition.getAccessHours());

        } else {

            CreditPackage creditPackage = creditPackageService.getActivePackage(type);

            int finalPrice = creditPackageService.calculateFinalPrice(creditPackage);

            payment.setCreditPackage(creditPackage);
            payment.setPurchasedCredits(creditPackage.getCredits());
            payment.setAmount(finalPrice);
            payment.setCurrency("SAR");

            payment.setAccessDurationHours(null);
            payment.setAccessExpiresAt(null);
        }

        payment.setStatus("PENDING");
        payment.setLocalReference("MADAR:" + UUID.randomUUID());

        // Reserved given_id for Moyasar payment fulfillment.
        payment.setProviderPaymentId(UUID.randomUUID().toString());

        payment.setCheckoutKey(key);
        payment.setRefundedAmount(0);

        paymentRepository.saveAndFlush(payment);

        MoyasarIntentDTO intent = moyasarClient.createIntent(payment.getAmount(), payment.getCurrency(), payment.getLocalReference(), callbackUrl);

        validateIntent(payment, intent);

        try {

            validUuid(
                    intent.id(),
                    "Moyasar returned an invalid intent identifier");

        } catch (ApiException e) {

            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Moyasar returned an invalid intent identifier");
        }

        payment.setProviderIntentId(intent.id());
        paymentRepository.saveAndFlush(payment);

        return checkoutResponse(payment, intent);
    }


    // Verify payment using trusted Moyasar data.
    @Transactional
    public PaymentResponseDTO verify(Integer userId, Integer paymentId) {

        getUser(userId);

        Payment payment =
                paymentRepository.findPaymentForUpdateByIdAndUser_Id(
                        paymentId,
                        userId
                );

        if (payment == null) {
            throw new ApiException(
                    "Payment not found for this user"
            );
        }

        requireTrustedAttempt(payment);

        String providerId = payment.getProviderPaymentId();

        MoyasarPaymentDTO provider =
                moyasarClient.getPayment(providerId);

        if (provider == null) {

            MoyasarIntentDTO intent =
                    moyasarClient.getIntent(payment.getProviderIntentId());

            validateIntent(payment, intent);

            if ("canceled".equals(intent.status())
                    || ("created".equals(intent.status())
                    && intent.expiresAt() != null
                    && !intent.expiresAt().isAfter(
                    OffsetDateTime.now()
            ))) {

                if ("PENDING".equals(payment.getStatus())) {

                    payment.setStatus("FAILED");
                    paymentRepository.save(payment);

                    notificationService.createNotification(
                            userId,
                            "فشلت عملية الدفع",
                            "تم إلغاء عملية الدفع أو انتهت صلاحيتها.",
                            "PAYMENT_FAILED",
                            null
                    );
                }
            }

            return response(payment);
        }

        synchronizePayment(payment, provider, providerId);

        return response(payment);
    }


    // Verify webhook then fetch trusted Moyasar payment.
    @Transactional
    public void processWebhook(MoyasarWebhookDTO event) {

        if (webhookSecret == null || webhookSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Moyasar webhook is not configured");
        }

        if (event == null
                || event.getSecretToken() == null
                || !MessageDigest.isEqual(
                webhookSecret.getBytes(StandardCharsets.UTF_8),
                event.getSecretToken().getBytes(StandardCharsets.UTF_8)
        )) {

            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Untrusted Moyasar webhook");
        }

        if (event.getId() == null
                || event.getId().isBlank()
                || event.getType() == null
                || event.getType().isBlank()) {

            throw new ApiException("Malformed Moyasar webhook");
        }

        if (!event.getType().startsWith("payment_")) {
            return;
        }

        if (event.getData() == null) {
            throw new ApiException("Missing webhook payment");
        }

        String providerId = validUuid(event.getData().getId(), "Invalid webhook payment identifier");

        String reference = event.getData().getDescription();

        if (reference == null || !reference.startsWith("MADAR:")) {
            return;
        }

        Payment payment = paymentRepository.findPaymentForUpdateByLocalReference(reference);

        if (payment == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Local payment attempt not found");
        }

        MoyasarPaymentDTO provider = moyasarClient.getPayment(providerId);

        if (provider == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Webhook payment is not yet available from Moyasar");
        }

        synchronizePayment(payment, provider, providerId);
    }


    public List<PaymentResponseDTO> getHistory(Integer userId, String status) {

        getUser(userId);

        String filter = status == null
                ? null
                : status.trim().toUpperCase(Locale.ROOT);

        if (filter != null
                && !Set.of(
                "PENDING", "PAID", "FAILED", "REFUNDED"
        ).contains(filter)) {

            throw new ApiException("Invalid payment status");
        }

        return paymentRepository.findPaymentsByUser_Id(userId)
                .stream()
                .filter(payment ->
                        filter == null
                                || filter.equals(payment.getStatus())
                )
                .sorted(
                        Comparator.comparing(Payment::getId).reversed()
                )
                .map(this::response)
                .toList();
    }


    // Existing legacy access remains unchanged.
    public FeatureAccessResponseDTO getAccess(Integer userId, String serviceType) {

        getUser(userId);

        return findAccess(userId, supportedLegacyService(serviceType));
    }


    public void requireCommuteAccess(Integer userId) {

        if (!getAccess(userId, "COMMUTE_REPORT").access()) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "Paid commute report access is required");
        }
    }


    // Payment row is locked by verify/webhook before any wallet mutation.
    private void synchronizePayment(Payment payment, MoyasarPaymentDTO provider, String providerId) {

        requireTrustedAttempt(payment);

        if (!providerId.equals(provider.id())
                || !providerId.equals(payment.getProviderPaymentId())
                || !payment.getAmount().equals(provider.amount())
                || !payment.getCurrency().equals(provider.currency())
                || !payment.getLocalReference().equals(
                provider.description())) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Moyasar payment does not match the local attempt");
        }

        Integer refunded = provider.refunded();

        if (provider.status() == null
                || refunded == null
                || refunded < 0
                || refunded > payment.getAmount()
                || ("refunded".equals(provider.status())
                && refunded == 0)) {

            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Invalid Moyasar refund amount");
        }

        String next;

        if (refunded > 0 || "refunded".equals(provider.status())) {

            next = "REFUNDED";

        } else if ("paid".equals(provider.status()) || "captured".equals(provider.status())) {

            if ("captured".equals(provider.status()) && !payment.getAmount().equals(provider.captured())) {

                throw new ResponseStatusException(HttpStatus.CONFLICT, "Partial capture does not grant access");
            }

            next = "PAID";

        } else if (Set.of(
                "failed", "voided", "expired"
        ).contains(provider.status())) {

            next = "FAILED";

        } else if (Set.of(
                "initiated", "authorized", "verified"
        ).contains(provider.status())) {

            next = "PENDING";

        } else {

            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unsupported Moyasar payment status");
        }

        String currentStatus = payment.getStatus();

        int previousRefunded =
                payment.getRefundedAmount() == null
                        ? 0
                        : payment.getRefundedAmount();

        int totalRefunded = Math.max(previousRefunded, refunded);

        // Existing refunded payment can receive additional refund updates.
        if ("REFUNDED".equals(currentStatus)) {

            if (isCreditPurchase(payment)) {
                applyCreditRefund(payment, totalRefunded);
            }

            payment.setRefundedAmount(totalRefunded);
            paymentRepository.save(payment);
            return;
        }

        // A confirmed payment cannot regress to pending/failed.
        if ("PAID".equals(currentStatus)
                && "voided".equals(provider.status())) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Previously paid transaction was voided; reconciliation required"
            );
        }

        if ("PAID".equals(currentStatus)
                && !"REFUNDED".equals(next)) {
            return;
        }
        if ("FAILED".equals(currentStatus) && "PENDING".equals(next)) {
            return;
        }

        if ("FAILED".equals(currentStatus) && payment.getPaidAt() != null && "PAID".equals(next)) {
            return;
        }

        // Credit purchase refund after a confirmed payment.
        if ("REFUNDED".equals(next)) {

            if (isCreditPurchase(payment)) {
                applyCreditRefund(payment, totalRefunded);
            }

            payment.setRefundedAmount(totalRefunded);
            payment.setStatus("REFUNDED");
            paymentRepository.save(payment);
            return;
        }

        // Confirm payment.
        if ("PAID".equals(next)) {

            if (payment.getPaidAt() == null) {

                LocalDateTime confirmedAt = LocalDateTime.now();
                payment.setPaidAt(confirmedAt);

                if (!isCreditPurchase(payment)) {

                    payment.setAccessExpiresAt(confirmedAt.plusHours(payment.getAccessDurationHours()));
                }
            }

            if (isCreditPurchase(payment)) {

                creditService.addPurchasedCredits(payment.getUser().getId(), payment.getId(), payment.getPurchasedCredits());
            }
        }

        payment.setRefundedAmount(totalRefunded);
        payment.setStatus(next);
        paymentRepository.save(payment);

// Create notifications only when payment status changes
        if (!currentStatus.equals(next)) {

            Integer userId = payment.getUser().getId();

            if ("PAID".equals(next)) {

                notificationService.createNotification(
                        userId,
                        "تم الدفع بنجاح",
                        "تم تأكيد عملية الدفع بنجاح.",
                        "PAYMENT_SUCCESS",
                        null
                );
                // Send payment success email through n8n after commit
                if (isCreditPurchase(payment)) {

                    n8nClient.sendAccountPaymentEventAfterCommit(
                            "PAYMENT_SUCCESS",
                            "PAYMENT_SUCCESS:" + payment.getId(),
                            payment.getUser().getFullName(),
                            payment.getUser().getEmail(),
                            payment.getId()
                    );
                }

                if (isCreditPurchase(payment)) {
                    notificationService.createNotification(
                            userId,
                            "تم شحن محفظتك",
                            "تمت إضافة " + payment.getPurchasedCredits()
                                    + " كريدت إلى محفظتك بنجاح.",
                            "CREDIT_PURCHASE",
                            null
                    );
                }

            } else if ("FAILED".equals(next)) {

                notificationService.createNotification(
                        userId,
                        "فشلت عملية الدفع",
                        "لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى.",
                        "PAYMENT_FAILED",
                        null
                );
            }
        }
    }


    // Revoke only the proportional additional refunded credits.
    private void applyCreditRefund(Payment payment,
            int totalRefundedHalalas) {

        // If payment was never confirmed locally,
        // no purchase credits were granted.
        if (payment.getPaidAt() == null) {
            return;
        }

        int purchasedCredits = payment.getPurchasedCredits();

        int alreadyRevoked =
                payment.getRefundedCredits() == null
                        ? 0
                        : payment.getRefundedCredits();

        if (alreadyRevoked < 0 || alreadyRevoked > purchasedCredits) {
            throw new ApiException("Invalid recorded refunded credits");
        }

        // Use long arithmetic to avoid integer overflow.
        int targetRefundedCredits = (int) (
                (long) purchasedCredits * totalRefundedHalalas
                        / payment.getAmount()
        );

        if (totalRefundedHalalas == payment.getAmount()) {
            targetRefundedCredits = purchasedCredits;
        }

        if (targetRefundedCredits < alreadyRevoked) {
            throw new ApiException("Credit refund state conflict");
        }

        int additionalCredits = targetRefundedCredits - alreadyRevoked;

        if (additionalCredits > 0) {

            creditService.revokePurchasedCredits(payment.getUser().getId(), payment.getId(), additionalCredits, targetRefundedCredits);

            payment.setRefundedCredits(targetRefundedCredits);
        }
    }


    private CheckoutResponseDTO resumeCheckout(Payment payment) {

        if (payment.getProviderIntentId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Checkout creation was unsuccessful or uncertain; "
                            + "this key will not create another intent");
        }

        if (!"PENDING".equals(payment.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Checkout is already completed; verify the payment");
        }

        MoyasarIntentDTO intent = moyasarClient.getIntent(payment.getProviderIntentId());

        validateIntent(payment, intent);

        return checkoutResponse(payment, intent);
    }


    private CheckoutResponseDTO checkoutResponse(Payment payment, MoyasarIntentDTO intent) {

        if (!"created".equals(intent.status())
                || intent.expiresAt() == null
                || !intent.expiresAt().isAfter(OffsetDateTime.now())
                || intent.clientSecret() == null
                || !intent.clientSecret().startsWith("pi_secret_")) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Checkout is expired or already used; verify its payment");
        }

        return new CheckoutResponseDTO(
                payment.getId(),
                payment.getServiceType(),
                payment.getAmount(),
                payment.getCurrency(),
                intent.id(),
                intent.clientSecret(),
                intent.expiresAt(),
                payment.getProviderPaymentId(),
                Map.of(
                        "madar_payment_id",
                        payment.getId().toString(),
                        "user_id",
                        payment.getUser().getId().toString(),
                        "service_type",
                        payment.getServiceType()
                )
        );
    }


    private void validateIntent(Payment payment, MoyasarIntentDTO intent) {

        if (intent == null || (payment.getProviderIntentId() != null
                && !payment.getProviderIntentId().equals(intent.id())) || !payment.getAmount().equals(intent.amount())
                || !payment.getCurrency().equals(intent.currency()) || !payment.getLocalReference().equals(
                intent.description())) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Moyasar intent does not match the local attempt");
        }
    }


    private void requireTrustedAttempt(Payment payment) {

        if (payment.getProviderIntentId() == null || payment.getProviderPaymentId() == null
                || payment.getCurrency() == null || payment.getLocalReference() == null
                || payment.getAmount() == null || payment.getAmount() <= 0) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Payment lacks trusted checkout details");
        }

        if (isCreditPurchase(payment)) {

            if (payment.getCreditPackage() == null || (payment.getPurchasedCredits() == null
                    || payment.getPurchasedCredits() <= 0)|| !"SAR".equals(payment.getCurrency())) {

                throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid credit package payment");
            }

        } else if (payment.getAccessDurationHours() == null || payment.getAccessDurationHours() <= 0) {

            throw new ResponseStatusException(HttpStatus.CONFLICT, "Legacy payment lacks access duration");
        }
    }


    private FeatureAccessResponseDTO findAccess(Integer userId, String type) {

        LocalDateTime now = LocalDateTime.now();

        LocalDateTime expiresAt =
                paymentRepository.findPaymentsByUser_Id(userId)
                        .stream()
                        .filter(payment ->
                                type.equals(payment.getServiceType())
                                        && "PAID".equals(payment.getStatus())
                                        && payment.getProviderPaymentId() != null
                                        && payment.getProviderIntentId() != null
                                        && payment.getLocalReference() != null
                                        && payment.getCurrency() != null
                                        && payment.getPaidAt() != null
                                        && payment.getAccessExpiresAt() != null
                                        && payment.getAccessExpiresAt().isAfter(now)
                                        && (payment.getRefundedAmount() == null
                                        || payment.getRefundedAmount() == 0)
                        )
                        .map(Payment::getAccessExpiresAt)
                        .max(Comparator.naturalOrder())
                        .orElse(null);

        return new FeatureAccessResponseDTO(type, expiresAt != null, expiresAt);
    }


    private String normalizeType(String serviceType) {

        if (serviceType == null || serviceType.isBlank()) {
            throw new ApiException("Payment type is required");
        }

        String type = serviceType.trim().toUpperCase(Locale.ROOT);

        if ("COMMUTE_REPORT".equals(type)) {
            return type;
        }

        CreditPackage creditPackage = creditPackageRepository.findCreditPackageByCode(type);

        if (creditPackage == null || !Boolean.TRUE.equals(creditPackage.getActive())) {

            throw new ApiException("Unsupported payment type");
        }

        return type;
    }


    private String supportedLegacyService(String serviceType) {

        if (serviceType == null || !"COMMUTE_REPORT".equals(serviceType.trim().toUpperCase(Locale.ROOT))) {

            throw new ApiException("Unsupported paid service type");
        }

        return "COMMUTE_REPORT";
    }


    private boolean isCreditPurchase(Payment payment) {
        return payment.getPurchasedCredits() != null;
    }


    private PaidServiceProperties.Definition serviceDefinition(String type) {

        PaidServiceProperties.Definition definition = paidServiceProperties.getServices().get(type);

        if (definition == null
                || !definition.isEnabled()
                || definition.getAmountHalalas() == null
                || definition.getAmountHalalas() < 100
                || !"SAR".equals(definition.getCurrency())
                || definition.getAccessHours() == null
                || definition.getAccessHours() <= 0) {

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Paid service pricing is not configured");
        }

        return definition;
    }

    private void validateCheckoutConfiguration() {
        try {
            URI callback = URI.create(callbackUrl);

            boolean isHttps =
                    "https".equalsIgnoreCase(callback.getScheme());

            boolean isLocalHttp =
                    "http".equalsIgnoreCase(callback.getScheme())
                            && ("localhost".equalsIgnoreCase(callback.getHost())
                            || "127.0.0.1".equals(callback.getHost()));

            if ((!isHttps && !isLocalHttp)
                    || callback.getHost() == null
                    || callback.getUserInfo() != null) {

                throw new IllegalArgumentException();
            }

        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Configure a valid Moyasar callback URL"
            );
        }
    }


    private void validateCommuteInputs(Integer userId) {

        List<PlacePreference> places =
                placePreferenceRepository.findPlacePreferencesByUser_Id(userId);

        boolean hasWeight = false;

        if (places.isEmpty()) {
            throw new ApiException(
                    "Add your important places before purchasing a commute report"
            );
        }

        for (PlacePreference place : places) {

            if (place.getLatitude() == null
                    || place.getLongitude() == null
                    || !Double.isFinite(place.getLatitude())
                    || !Double.isFinite(place.getLongitude())
                    || place.getLatitude() < -90
                    || place.getLatitude() > 90
                    || place.getLongitude() < -180
                    || place.getLongitude() > 180
                    || place.getImportance() == null
                    || place.getImportance() < 1
                    || place.getImportance() > 5
                    || place.getVisitPerWeek() == null
                    || place.getVisitPerWeek() < 0
                    || (long) place.getImportance()
                    * place.getVisitPerWeek() > Integer.MAX_VALUE) {

                throw new ApiException("Correct your important places before purchasing a commute report");
            }

            hasWeight |= place.getVisitPerWeek() > 0;
        }

        if (!hasWeight) {
            throw new ApiException("At least one important place must have weekly visits");
        }
    }


    private User getUser(Integer userId) {

        User user = userRepository.findUserById(userId);

        if (user == null) {
            throw new ApiException("User not found");
        }

        return user;
    }


    private String validUuid(String value, String message) {

        try {

            if (value == null || !UUID.fromString(value).toString().equalsIgnoreCase(value)) {

                throw new IllegalArgumentException();
            }

            return value.toLowerCase(Locale.ROOT);

        } catch (IllegalArgumentException e) {

            throw new ApiException(message);
        }
    }


    private PaymentResponseDTO response(Payment payment) {

        return new PaymentResponseDTO(payment.getId(), payment.getServiceType(), payment.getAmount(), payment.getCurrency(), payment.getStatus(), payment.getCreatedAt(), payment.getPaidAt(), payment.getAccessExpiresAt(), payment.getRefundedAmount());
    }
}