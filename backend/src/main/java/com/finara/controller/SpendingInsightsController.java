package com.finara.controller;

import com.finara.service.SpendingInsightsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SpendingInsightsController {

    private final SpendingInsightsService spendingInsightsService;

    /**
     * GET /api/subscriptions
     * Returns all detected recurring charges for the authenticated user.
     * No date filter — recurring detection spans the full transaction history.
     */
    @GetMapping("/api/subscriptions")
    public ResponseEntity<Map<String, Object>> getSubscriptions(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(spendingInsightsService.getRecurringCharges(userId));
    }

    /**
     * GET /api/subscriptions/transactions?name=netflix&amount=16
     * Returns individual transactions matching a detected recurring charge.
     */
    @GetMapping("/api/subscriptions/transactions")
    public ResponseEntity<Map<String, Object>> getSubscriptionTransactions(
            @RequestParam String name,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        var txns = spendingInsightsService.getSubscriptionTransactions(userId, name);
        return ResponseEntity.ok(Map.of("transactions", txns, "count", txns.size()));
    }

    /**
     * GET /api/merchants/leaderboard?startMonth=YYYY-MM&endMonth=YYYY-MM
     * Returns top 20 merchants by total spend for the given period, with trend vs prior period.
     * Defaults to the most recent calendar month if no params supplied.
     */
    @GetMapping("/api/merchants/leaderboard")
    public ResponseEntity<Map<String, Object>> getMerchantLeaderboard(
            @RequestParam(required = false) String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");

        if (startMonth == null || endMonth == null) {
            YearMonth now = YearMonth.now();
            endMonth   = now.toString();
            startMonth = now.minusMonths(2).toString();
        }

        return ResponseEntity.ok(
                spendingInsightsService.getMerchantLeaderboard(userId, startMonth, endMonth));
    }
}
