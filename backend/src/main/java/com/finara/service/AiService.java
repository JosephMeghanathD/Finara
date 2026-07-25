package com.finara.service;

import com.finara.config.TimingContext;
import com.finara.dto.ai.ChatRequest;
import com.finara.dto.ai.SavingsGoalRequest;
import com.finara.model.Budget;
import com.finara.model.CoachTip;
import com.finara.model.FinancialReport;
import com.finara.model.Transaction;
import com.finara.model.User;
import com.finara.repository.BudgetRepository;
import com.finara.repository.CoachTipRepository;
import com.finara.repository.FinancialReportRepository;
import com.finara.repository.TransactionRepository;
import com.finara.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
    private final FinancialReportRepository financialReportRepository;
    private final BudgetRepository budgetRepository;
    private final CoachTipRepository coachTipRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    @Value("${service.token:finara_internal_svc_token_2026}")
    private String serviceToken;

    // ─── Story data (no AI) ───────────────────────────────────────────────────

    public Map<String, Object> getStoryData(Long userId, String startMonth, String endMonth) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        String end = endMonth != null ? endMonth : startMonth;
        Map<String, Object> summary = buildRangeSummary(userId, startMonth, end, user);
        Map<String, Object> result  = new HashMap<>(summary);
        result.put("highlights", buildHighlights(summary));
        return result;
    }

    // ─── UC8: Monthly Financial Story ────────────────────────────────────────

    @Cacheable(value = "stories", key = "#userId + '_' + #startMonth + '_' + (#endMonth != null ? #endMonth : #startMonth)")
    @SuppressWarnings("unchecked")
    public Map<String, Object> generateStory(Long userId, String startMonth, String endMonth) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String end = endMonth != null ? endMonth : startMonth;
        Map<String, Object> summary = buildRangeSummary(userId, startMonth, end, user);

        String label = startMonth.equals(end) ? startMonth : startMonth + " to " + end;
        Map<String, Object> body = new HashMap<>();
        body.put("month",           label);
        body.put("summary",         summary);
        body.put("history_context", buildUserHistoryContext(userId));

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/story", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        String story = resp != null ? (String) resp.get("story") : "Unable to generate story.";

        // Persist so future visits load instantly via GET /api/reports/{key}
        String reportKey = startMonth.equals(end) ? startMonth : startMonth + "~" + end;
        FinancialReport report = financialReportRepository
                .findByUserIdAndMonth(userId, reportKey)
                .orElseGet(() -> {
                    FinancialReport r = new FinancialReport();
                    r.setUser(user);
                    r.setMonth(reportKey);
                    return r;
                });
        report.setNarrativeStory(story);
        financialReportRepository.save(report);

        Map<String, Object> result = new HashMap<>();
        result.put("story",      story);
        result.put("startMonth", startMonth);
        result.put("endMonth",   end);
        result.put("summary",    summary);
        result.put("highlights", buildHighlights(summary));
        return result;
    }

    // ─── UC9: Explain Anomaly ─────────────────────────────────────────────────

    @Cacheable(value = "anomaly-explanations", key = "#transactionId")
    @SuppressWarnings("unchecked")
    public Map<String, Object> explainAnomaly(Long userId, Long transactionId) {
        Transaction txn = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Transaction not found"));

        if (!txn.getUser().getId().equals(userId)) {
            throw new RuntimeException("Access denied");
        }

        // Calculate user's average spend in that category
        String month = txn.getTransactionDate().toString().substring(0, 7);
        long dbStart = System.currentTimeMillis();
        List<Object[]> catSummary = transactionRepository
                .getCategorySummaryForMonth(userId, month);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);
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

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/explain-anomaly", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        String explanation = resp != null ? (String) resp.get("explanation") : "Unable to explain.";
        return Map.<String, Object>of("explanation", explanation);
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

        long dbStart = System.currentTimeMillis();
        Map<String, Double> categories = getCategoryTotals(userId, startMonth, endMonth);
        double income = getActualMonthlyIncome(userId, startMonth, endMonth, user);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        Map<String, Object> body = new HashMap<>();
        body.put("goal_amount",      req.getGoalAmount());
        body.put("timeframe_months", req.getTimeframeMonths());
        body.put("monthly_income",   income);
        body.put("monthly_spending", categories);
        body.put("history_context",  buildUserHistoryContext(userId));

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/reality-check", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
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

        long dbStart = System.currentTimeMillis();
        Map<String, Double> categories = getCategoryTotals(userId, startMonth, endMonth);
        double income = getActualMonthlyIncome(userId, startMonth, endMonth, user);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        Map<String, Object> body = new HashMap<>();
        body.put("goal_amount",      req.getGoalAmount());
        body.put("timeframe_months", req.getTimeframeMonths());
        body.put("monthly_income",   income);
        body.put("monthly_spending", categories);
        body.put("history_context",  buildUserHistoryContext(userId));

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/plan", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        return resp != null ? resp : Map.of("error", "Service unavailable");
    }

    // ─── UC12: Chat ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> chat(Long userId, ChatRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String now = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String startMonth = req.getStartMonth() != null ? req.getStartMonth()
                : (req.getMonth() != null ? req.getMonth() : now);
        String endMonth   = req.getEndMonth()   != null ? req.getEndMonth()   : startMonth;

        Map<String, Object> context = buildRangeSummary(userId, startMonth, endMonth, user);

        // Pre-built sorted chart data — Python uses this directly for accurate chart rendering
        @SuppressWarnings("unchecked")
        Map<String, Double> catMap = (Map<String, Double>) context.get("categories");
        List<Map<String, Object>> chartCategories = catMap.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .filter(e -> e.getValue() > 0)
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name",  e.getKey());
                    m.put("value", Math.round(e.getValue() * 100.0) / 100.0);
                    return m;
                })
                .collect(Collectors.toList());
        context.put("chart_categories", chartCategories);

        // Add month-by-month history so Python can build trend/line charts
        long histStart = System.currentTimeMillis();
        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> histMonths = allMonths.stream().limit(6).sorted().collect(Collectors.toList());
        Set<String> excl = Set.of("Income", "Transfer");
        List<Map<String, Object>> monthlyHistory = new ArrayList<>();
        for (String m : histMonths) {
            List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, m);
            double total = rows.stream()
                    .filter(r -> r[0] == null || !excl.contains((String) r[0]))
                    .mapToDouble(r -> ((Number) r[1]).doubleValue()).sum();
            Double inc = transactionRepository.getCreditTotalForRange(userId, m, m);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("month", m);
            entry.put("total", Math.round(total * 100.0) / 100.0);
            if (inc != null) entry.put("income", Math.round(inc * 100.0) / 100.0);
            monthlyHistory.add(entry);
        }
        TimingContext.record("db_ms", System.currentTimeMillis() - histStart);
        context.put("monthly_history", monthlyHistory);

        // All available months for Gemma to reference in suggestions
        List<String> availableMonths = allMonths.stream().limit(12).sorted().collect(Collectors.toList());
        context.put("available_months", availableMonths);

        Map<String, Object> body = new HashMap<>();
        body.put("message",         req.getMessage());
        body.put("context",         context);
        body.put("history",         req.getHistory() != null ? req.getHistory() : List.of());
        body.put("history_context", buildUserHistoryContext(userId));
        // Allow ml-service to call back for live data fetching
        body.put("user_id",         userId);
        body.put("service_token",   serviceToken);
        // UI-selected time range (the ceiling for live queries). ui_range_set is false
        // when no filter was chosen — then ml-service treats it as all-time.
        body.put("ui_start_month",  startMonth);
        body.put("ui_end_month",    endMonth);
        body.put("ui_range_set",    req.getStartMonth() != null || req.getMonth() != null);

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/chat", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reply", resp != null ? (String) resp.get("reply") : "I'm unable to respond right now.");
        if (resp != null && resp.get("chart")       != null) result.put("chart",       resp.get("chart"));
        if (resp != null && resp.get("suggestions") != null) result.put("suggestions", resp.get("suggestions"));
        return result;
    }

    // ─── UC13: Merchant Explainer ─────────────────────────────────────────────

    @Cacheable(value = "merchants", key = "#merchantName")
    @SuppressWarnings("unchecked")
    public Map<String, Object> explainMerchant(String merchantName) {
        Map<String, Object> body = Map.of("merchant_name", merchantName);
        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/explain-merchant", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
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

        long dbStart = System.currentTimeMillis();
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
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        double avgWeek = pastTxns.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> !"Transfer".equals(t.getCategory()))
                .mapToDouble(t -> t.getAmount().doubleValue()).sum() / 4.0;
        double vsAvgPct = avgWeek > 0 ? ((weekTotal - avgWeek) / avgWeek) * 100 : 0;

        Map<String, Object> weeklyData = new LinkedHashMap<>();
        weeklyData.put("categories",      categories);
        weeklyData.put("total",           weekTotal);
        weeklyData.put("income",          weekIncome);
        weeklyData.put("compared_to_avg", vsAvgPct);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("weekly_data", weeklyData);

        // Attach current month's budget vs MTD actuals so Gemma can flag over-budget categories
        String currentMonth = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        List<Budget> budgets = budgetRepository.findByUserIdAndMonth(userId, currentMonth);
        if (!budgets.isEmpty()) {
            Set<String> exclBudget = Set.of("Income", "Transfer");
            List<Object[]> mtdRows = transactionRepository.getCategorySummaryForMonth(userId, currentMonth);
            Map<String, Double> mtdActuals = new LinkedHashMap<>();
            for (Object[] row : mtdRows) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (!exclBudget.contains(cat))
                    mtdActuals.put(cat, ((Number) row[1]).doubleValue());
            }

            int dayOfMonth   = LocalDate.now().getDayOfMonth();
            int daysInMonth  = LocalDate.now().lengthOfMonth();
            int pctThrough   = (int) Math.round((double) dayOfMonth / daysInMonth * 100);

            Map<String, Object> budgetCats = new LinkedHashMap<>();
            for (Budget b : budgets) {
                String cat    = b.getCategory();
                double budget = b.getBudgetAmount().doubleValue();
                double spent  = mtdActuals.getOrDefault(cat, 0.0);
                double remain = budget - spent;
                int    pctUsed = budget > 0 ? (int) Math.round((spent / budget) * 100) : 0;

                Map<String, Object> catData = new LinkedHashMap<>();
                catData.put("budget",      budget);
                catData.put("spent_mtd",   Math.round(spent * 100.0) / 100.0);
                catData.put("remaining",   Math.round(remain * 100.0) / 100.0);
                catData.put("pct_used",    pctUsed);
                catData.put("over_budget", spent > budget);
                budgetCats.put(cat, catData);
            }

            Map<String, Object> budgetCtx = new LinkedHashMap<>();
            budgetCtx.put("month",              currentMonth);
            budgetCtx.put("day_of_month",       dayOfMonth);
            budgetCtx.put("days_in_month",      daysInMonth);
            budgetCtx.put("pct_through_month",  pctThrough);
            budgetCtx.put("categories",         budgetCats);
            body.put("budget_context", budgetCtx);
        }

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/coach", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        if (resp == null) return Map.of("tips", List.of("No tips available right now."));

        String topCategory = categories.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse("");
        Map<String, Object> result = new HashMap<>(resp);
        result.put("context", Map.of(
                "total",        weekTotal,
                "vs_avg_pct",   vsAvgPct,
                "income",       weekIncome,
                "week_start",   monday.toString(),
                "week_end",     sunday.toString(),
                "top_category", topCategory
        ));
        return result;
    }

    // ─── Coach Tip Persistence ────────────────────────────────────────────────

    public List<Map<String, Object>> getCoachTips(Long userId, String weekKey) {
        return coachTipRepository.findByUserIdAndWeekKeyOrderByTipIndex(userId, weekKey)
                .stream().map(this::tipToMap).collect(Collectors.toList());
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> saveCoachTips(Long userId, String weekKey, List<Map<String, Object>> tips) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        coachTipRepository.deleteByUserIdAndWeekKey(userId, weekKey);
        List<CoachTip> entities = new ArrayList<>();
        for (int i = 0; i < tips.size(); i++) {
            Map<String, Object> t = tips.get(i);
            entities.add(CoachTip.builder()
                    .user(user)
                    .weekKey(weekKey)
                    .tipIndex(i)
                    .tipText(t.getOrDefault("text", "").toString())
                    .category(t.getOrDefault("category", "Tip").toString())
                    .impact(t.getOrDefault("impact", "medium").toString())
                    .howTo(t.getOrDefault("how_to", "").toString())
                    .done(false)
                    .build());
        }
        return coachTipRepository.saveAll(entities).stream().map(this::tipToMap).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> toggleCoachTipDone(Long userId, Long tipId, boolean done) {
        CoachTip tip = coachTipRepository.findById(tipId)
                .orElseThrow(() -> new RuntimeException("Tip not found"));
        if (!tip.getUser().getId().equals(userId)) throw new RuntimeException("Access denied");
        tip.setDone(done);
        return tipToMap(coachTipRepository.save(tip));
    }

    private Map<String, Object> tipToMap(CoachTip tip) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",       tip.getId());
        m.put("tipIndex", tip.getTipIndex());
        m.put("text",     tip.getTipText());
        m.put("category", tip.getCategory());
        m.put("impact",   tip.getImpact());
        m.put("how_to",   tip.getHowTo());
        m.put("done",     tip.isDone());
        return m;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> buildRangeSummary(Long userId, String startMonth, String endMonth, User user) {
        long dbStart = System.currentTimeMillis();
        List<Transaction> txns = transactionRepository.findByUserIdAndMonthRange(userId, startMonth, endMonth);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

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

        // savings_transferred is already excluded from totalSpent (removed from categories above).
        // Net cash flow = income vs actual spending only. Savings is shown as its own stat.
        double netCashFlow = income - totalSpent;

        List<Map<String, Object>> anomalies = txns.stream()
                .filter(t -> Boolean.TRUE.equals(t.getIsAnomaly()) && !"CREDIT".equals(t.getTransactionType()))
                .map(t -> Map.<String, Object>of(
                        "description",    t.getDescription(),
                        "amount",         t.getAmount().doubleValue(),
                        "anomaly_reason", t.getAnomalyReason() != null ? t.getAnomalyReason() : ""))
                .collect(Collectors.toList());

        List<Map<String, Object>> topTransactions = txns.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> !"Transfer".equals(t.getCategory()))
                .sorted((a, b) -> b.getAmount().compareTo(a.getAmount()))
                .limit(5)
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("description", t.getDescription());
                    m.put("amount",      t.getAmount().doubleValue());
                    m.put("date",        t.getTransactionDate().toString());
                    m.put("category",    t.getCategory() != null ? t.getCategory() : "Other");
                    return m;
                })
                .collect(Collectors.toList());

        Map<String, Object> summary = new HashMap<>();
        summary.put("categories",          categories);
        summary.put("total_spent",         totalSpent);
        summary.put("income",              income);
        summary.put("net_cash_flow",       netCashFlow);
        summary.put("savings_transferred", savingsTransferred);
        summary.put("anomalies",           anomalies);
        summary.put("top_transactions",    topTransactions);
        summary.put("period",              startMonth.equals(endMonth) ? startMonth : startMonth + " to " + endMonth);

        return summary;
    }

    private Map<String, Double> getCategoryTotals(Long userId, String startMonth, String endMonth) {
        // Use the anomaly-free query so large one-off events (ER visits, big trips,
        // appliance failures) don't inflate the typical monthly spending figure.
        List<Object[]> rows = transactionRepository.getCategorySummaryForRangeNormal(userId, startMonth, endMonth);
        Set<String> excluded = Set.of("Income", "Transfer");
        long months = numMonthsBetween(startMonth, endMonth);
        Map<String, Double> result = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (!excluded.contains(cat))
                result.put(cat, ((Number) row[1]).doubleValue() / months);
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

    private String buildUserHistoryContext(Long userId) {
        try {
            List<String> months = transactionRepository.findDistinctMonthsByUserId(userId)
                    .stream().limit(6).sorted().collect(Collectors.toList());
            if (months.isEmpty()) return "";

            String histStart = months.get(0);
            String histEnd   = months.get(months.size() - 1);
            long   numMonths = Math.max(1, months.size());

            Set<String> excluded = Set.of("Income", "Transfer");
            List<Object[]> catRows = transactionRepository
                    .getCategorySummaryForRangeNormal(userId, histStart, histEnd);
            Map<String, Double> catAvgs = new LinkedHashMap<>();
            for (Object[] row : catRows) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (!excluded.contains(cat))
                    catAvgs.put(cat, ((Number) row[1]).doubleValue() / numMonths);
            }
            double totalAvg = catAvgs.values().stream().mapToDouble(Double::doubleValue).sum();

            Double creditTotal = transactionRepository.getCreditTotalForRange(userId, histStart, histEnd);
            double incomeAvg = (creditTotal != null && creditTotal > 0) ? creditTotal / numMonths : 0.0;

            String trendLabel = "stable";
            if (months.size() >= 4) {
                int mid = months.size() / 2;
                double firstAvg = sumSpendForMonths(userId, months.subList(0, mid), excluded)
                        / Math.max(1, mid);
                double secondAvg = sumSpendForMonths(userId, months.subList(mid, months.size()), excluded)
                        / Math.max(1, months.size() - mid);
                if (secondAvg > firstAvg * 1.08)      trendLabel = "worsening (spending up)";
                else if (secondAvg < firstAvg * 0.92) trendLabel = "improving (spending down)";
            }

            String topCats = catAvgs.entrySet().stream()
                    .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                    .limit(5)
                    .map(e -> e.getKey() + " $" + String.format("%.0f", e.getValue()))
                    .collect(Collectors.joining(", "));

            return String.format(
                    "=== 6-MONTH HISTORY (%s to %s) ===\n" +
                    "Avg monthly spend: $%.0f | Avg monthly income: $%.0f | Trend: %s\n" +
                    "Top categories (monthly avg): %s\n" +
                    "=== END HISTORY ===",
                    histStart, histEnd, totalAvg, incomeAvg, trendLabel, topCats);

        } catch (Exception e) {
            log.warn("Failed to build history context for user {}: {}", userId, e.getMessage());
            return "";
        }
    }

    private double sumSpendForMonths(Long userId, List<String> months, Set<String> excluded) {
        return months.stream().mapToDouble(m ->
            transactionRepository.getCategorySummaryForMonth(userId, m).stream()
                .filter(r -> r[0] == null || !excluded.contains((String) r[0]))
                .mapToDouble(r -> ((Number) r[1]).doubleValue()).sum()
        ).sum();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildHighlights(Map<String, Object> summary) {
        List<Map<String, Object>> highlights = new ArrayList<>();

        double totalSpent         = ((Number) summary.getOrDefault("total_spent", 0.0)).doubleValue();
        double netCashFlow        = ((Number) summary.getOrDefault("net_cash_flow", 0.0)).doubleValue();
        double savingsTransferred = ((Number) summary.getOrDefault("savings_transferred", 0.0)).doubleValue();
        Map<String, Double> cats  = (Map<String, Double>) summary.getOrDefault("categories", Map.of());
        List<?>             anoms = (List<?>) summary.getOrDefault("anomalies", List.of());

        highlights.add(Map.of("label", "Total Spent",   "value", formatCurrency(totalSpent),   "type", "neutral"));

        String ncfSign  = netCashFlow >= 0 ? "+" : "-";
        String ncfLabel = netCashFlow >= 0 ? "surplus" : "deficit";
        highlights.add(Map.of(
                "label", "Net Cash Flow",
                "value", ncfSign + formatCurrency(Math.abs(netCashFlow)) + " " + ncfLabel,
                "type",  netCashFlow >= 0 ? "positive" : "negative"));

        cats.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(top -> highlights.add(Map.of(
                        "label", "Top Spending",
                        "value", top.getKey() + " · " + formatCurrency(top.getValue()),
                        "type",  "info")));

        if (savingsTransferred > 0)
            highlights.add(Map.of("label", "Saved", "value", formatCurrency(savingsTransferred), "type", "positive"));

        if (!anoms.isEmpty())
            highlights.add(Map.of("label", "Anomalies", "value", anoms.size() + " flagged", "type", "warning"));

        return highlights;
    }

    private String formatCurrency(double amount) {
        return "$" + String.format("%,.0f", amount);
    }
}
