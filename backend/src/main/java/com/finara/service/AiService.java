package com.finara.service;

import com.finara.dto.ai.ChatRequest;
import com.finara.dto.ai.SavingsGoalRequest;
import com.finara.model.Transaction;
import com.finara.model.User;
import com.finara.repository.TransactionRepository;
import com.finara.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.IsoFields;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiService {

    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    // ─── UC8: Monthly Financial Story ────────────────────────────────────────

    @Cacheable(value = "stories", key = "#userId + '_' + #startMonth + '_' + (#endMonth != null ? #endMonth : #startMonth)")
    @SuppressWarnings("unchecked")
    public Map<String, String> generateStory(Long userId, String startMonth, String endMonth) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String end = endMonth != null ? endMonth : startMonth;
        Map<String, Object> summary = buildRangeSummary(userId, startMonth, end, user);

        String label = startMonth.equals(end) ? startMonth : startMonth + " to " + end;
        Map<String, Object> body = Map.of(
                "month",   label,
                "summary", summary
        );

        Map resp = mlRestTemplate.postForObject("/api/ai/story", body, Map.class);
        String story = resp != null ? (String) resp.get("story") : "Unable to generate story.";
        return Map.of("story", story, "startMonth", startMonth, "endMonth", end);
    }

    // ─── UC9: Explain Anomaly ─────────────────────────────────────────────────

    @Cacheable(value = "anomaly-explanations", key = "#transactionId")
    @SuppressWarnings("unchecked")
    public Map<String, String> explainAnomaly(Long userId, Long transactionId) {
        Transaction txn = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Transaction not found"));

        if (!txn.getUser().getId().equals(userId)) {
            throw new RuntimeException("Access denied");
        }

        // Calculate user's average spend in that category
        String month = txn.getTransactionDate().toString().substring(0, 7);
        List<Object[]> catSummary = transactionRepository
                .getCategorySummaryForMonth(userId, month);
        double avgInCat = catSummary.stream()
                .filter(r -> txn.getCategory() != null && txn.getCategory().equals(r[0]))
                .mapToDouble(r -> ((Number) r[1]).doubleValue())
                .findFirst().orElse(0.0);

        Map<String, Object> txnMap = Map.of(
                "description",    txn.getDescription(),
                "amount",         txn.getAmount().doubleValue(),
                "date",           txn.getTransactionDate().toString(),
                "category",       txn.getCategory() != null ? txn.getCategory() : "Unknown",
                "anomaly_reason", txn.getAnomalyReason() != null ? txn.getAnomalyReason() : "Unusual pattern"
        );

        Map<String, Object> body = Map.of(
                "transaction",   txnMap,
                "user_context",  Map.of("avg_category_spend", avgInCat)
        );

        Map resp = mlRestTemplate.postForObject("/api/ai/explain-anomaly", body, Map.class);
        String explanation = resp != null ? (String) resp.get("explanation") : "Unable to explain.";
        return Map.of("explanation", explanation);
    }

    // ─── UC10: Reality Check ──────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> realityCheck(Long userId, SavingsGoalRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String now = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String startMonth = req.getStartMonth() != null ? req.getStartMonth()
                : (req.getMonth() != null ? req.getMonth() : now);
        String endMonth   = req.getEndMonth()   != null ? req.getEndMonth()   : startMonth;

        Map<String, Double> categories = getCategoryTotals(userId, startMonth, endMonth);
        double income = getActualMonthlyIncome(userId, startMonth, endMonth, user);

        Map<String, Object> body = Map.of(
                "goal_amount",       req.getGoalAmount(),
                "timeframe_months",  req.getTimeframeMonths(),
                "monthly_income",    income,
                "monthly_spending",  categories
        );

        Map resp = mlRestTemplate.postForObject("/api/ai/reality-check", body, Map.class);
        return resp != null ? resp : Map.of("error", "Service unavailable");
    }

    // ─── UC11: Savings Plan ───────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> createSavingsPlan(Long userId, SavingsGoalRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String now = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String startMonth = req.getStartMonth() != null ? req.getStartMonth()
                : (req.getMonth() != null ? req.getMonth() : now);
        String endMonth   = req.getEndMonth()   != null ? req.getEndMonth()   : startMonth;

        Map<String, Double> categories = getCategoryTotals(userId, startMonth, endMonth);
        double income = getActualMonthlyIncome(userId, startMonth, endMonth, user);

        Map<String, Object> body = Map.of(
                "goal_amount",       req.getGoalAmount(),
                "timeframe_months",  req.getTimeframeMonths(),
                "monthly_income",    income,
                "monthly_spending",  categories
        );

        Map resp = mlRestTemplate.postForObject("/api/ai/plan", body, Map.class);
        return resp != null ? resp : Map.of("error", "Service unavailable");
    }

    // ─── UC12: Chat ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, String> chat(Long userId, ChatRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String now = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String startMonth = req.getStartMonth() != null ? req.getStartMonth()
                : (req.getMonth() != null ? req.getMonth() : now);
        String endMonth   = req.getEndMonth()   != null ? req.getEndMonth()   : startMonth;

        Map<String, Object> context = buildRangeSummary(userId, startMonth, endMonth, user);

        Map<String, Object> body = new HashMap<>();
        body.put("message",  req.getMessage());
        body.put("context",  context);
        body.put("history",  req.getHistory() != null ? req.getHistory() : List.of());

        Map resp = mlRestTemplate.postForObject("/api/ai/chat", body, Map.class);
        String reply = resp != null ? (String) resp.get("reply") : "I'm unable to respond right now.";
        return Map.of("reply", reply);
    }

    // ─── UC13: Merchant Explainer ─────────────────────────────────────────────

    @Cacheable(value = "merchants", key = "#merchantName")
    @SuppressWarnings("unchecked")
    public Map<String, Object> explainMerchant(String merchantName) {
        Map<String, Object> body = Map.of("merchant_name", merchantName);
        Map resp = mlRestTemplate.postForObject("/api/ai/explain-merchant", body, Map.class);
        return resp != null ? resp : Map.of("explanation", "Unknown merchant", "likely_category", "Other");
    }

    // ─── UC14: Weekly Coach ───────────────────────────────────────────────────

    @Cacheable(value = "coach", key = "#userId + '_' + (#weekParam != null ? #weekParam : 'current')")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getWeeklyCoachTips(Long userId, String weekParam) {
        // Determine week date range
        LocalDate now    = LocalDate.now();
        LocalDate monday = weekParam != null ? now : now.with(DayOfWeek.MONDAY);
        LocalDate sunday = monday.plusDays(6);

        List<Transaction> weekTxns = transactionRepository
                .findByUserIdAndTransactionDateBetweenOrderByTransactionDateDesc(
                        userId, monday, sunday);

        // Spending: DEBIT only, excluding internal transfer category
        Map<String, Double> categories = weekTxns.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> !"Transfer".equals(t.getCategory()))
                .collect(Collectors.groupingBy(
                        t -> t.getCategory() != null ? t.getCategory() : "Other",
                        Collectors.summingDouble(t -> t.getAmount().doubleValue())));

        double weekTotal = categories.values().stream().mapToDouble(Double::doubleValue).sum();

        // Income received this week (CREDIT)
        double weekIncome = weekTxns.stream()
                .filter(t -> "CREDIT".equals(t.getTransactionType()))
                .mapToDouble(t -> t.getAmount().doubleValue())
                .sum();

        // Compare to average spending week (DEBIT only, last 4 weeks)
        LocalDate fourWeeksAgo = monday.minusWeeks(4);
        List<Transaction> pastTxns = transactionRepository
                .findByUserIdAndTransactionDateBetweenOrderByTransactionDateDesc(
                        userId, fourWeeksAgo, monday.minusDays(1));
        double avgWeek = pastTxns.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> !"Transfer".equals(t.getCategory()))
                .mapToDouble(t -> t.getAmount().doubleValue()).sum() / 4.0;
        double vsAvgPct = avgWeek > 0 ? ((weekTotal - avgWeek) / avgWeek) * 100 : 0;

        Map<String, Object> body = Map.of(
                "weekly_data", Map.of(
                        "categories",        categories,
                        "total",             weekTotal,
                        "income",            weekIncome,
                        "compared_to_avg",   vsAvgPct
                )
        );

        Map resp = mlRestTemplate.postForObject("/api/ai/coach", body, Map.class);
        return resp != null ? resp : Map.of("tips", List.of("No tips available right now."));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> buildRangeSummary(Long userId, String startMonth, String endMonth, User user) {
        List<Transaction> txns = transactionRepository.findByUserIdAndMonthRange(userId, startMonth, endMonth);

        // Spending: DEBIT only
        Map<String, Double> categories = txns.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .collect(Collectors.groupingBy(
                        t -> t.getCategory() != null ? t.getCategory() : "Other",
                        Collectors.summingDouble(t -> t.getAmount().doubleValue())));

        // Pull savings transfers out separately so they don't distort the spending breakdown
        Double transferAmt = categories.remove("Transfer");
        double savingsTransferred = transferAmt != null ? transferAmt : 0.0;

        double totalSpent = categories.values().stream().mapToDouble(Double::doubleValue).sum();

        // Income: actual CREDIT transactions in the period, fall back to profile value
        double actualIncome = txns.stream()
                .filter(t -> "CREDIT".equals(t.getTransactionType()))
                .mapToDouble(t -> t.getAmount().doubleValue())
                .sum();
        double income = actualIncome > 0 ? actualIncome
                : (user.getMonthlyIncome() != null ? user.getMonthlyIncome().doubleValue() : 0.0);

        double netCashFlow = income - totalSpent - savingsTransferred;

        List<Map<String, Object>> anomalies = txns.stream()
                .filter(t -> Boolean.TRUE.equals(t.getIsAnomaly()) && !"CREDIT".equals(t.getTransactionType()))
                .map(t -> Map.<String, Object>of(
                        "description",    t.getDescription(),
                        "amount",         t.getAmount().doubleValue(),
                        "anomaly_reason", t.getAnomalyReason() != null ? t.getAnomalyReason() : ""))
                .collect(Collectors.toList());

        Map<String, Object> summary = new HashMap<>();
        summary.put("categories",          categories);
        summary.put("total_spent",         totalSpent);
        summary.put("income",              income);
        summary.put("net_cash_flow",       netCashFlow);
        summary.put("savings_transferred", savingsTransferred);
        summary.put("anomalies",           anomalies);
        summary.put("period",              startMonth.equals(endMonth) ? startMonth : startMonth + " to " + endMonth);

        return summary;
    }

    private Map<String, Double> getCategoryTotals(Long userId, String startMonth, String endMonth) {
        List<Object[]> rows = transactionRepository.getCategorySummaryForRange(userId, startMonth, endMonth);
        // Exclude internal tracking categories — Income is CREDIT and Transfer is savings movement
        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Double> result = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (!excluded.contains(cat))
                result.put(cat, ((Number) row[1]).doubleValue());
        }
        return result;
    }

    private double getActualMonthlyIncome(Long userId, String startMonth, String endMonth, User user) {
        Double creditTotal = transactionRepository.getCreditTotalForRange(userId, startMonth, endMonth);
        if (creditTotal != null && creditTotal > 0) {
            long months = numMonthsBetween(startMonth, endMonth);
            return creditTotal / Math.max(1, months);
        }
        return user.getMonthlyIncome() != null ? user.getMonthlyIncome().doubleValue() : 0.0;
    }

    private long numMonthsBetween(String startMonth, String endMonth) {
        String[] s = startMonth.split("-"), e = endMonth.split("-");
        return Math.max(1, (long)(Integer.parseInt(e[0]) - Integer.parseInt(s[0])) * 12
                + (Integer.parseInt(e[1]) - Integer.parseInt(s[1])) + 1);
    }
}
