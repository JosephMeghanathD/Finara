package com.finara.service;

import com.finara.dto.budget.BudgetRequest;
import com.finara.dto.budget.MultiBudgetRequest;
import com.finara.model.Budget;
import com.finara.model.User;
import com.finara.repository.BudgetRepository;
import com.finara.repository.TransactionRepository;
import com.finara.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.finara.config.TimingContext;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    // ─── UC7: Budget vs Actual ─────────────────────────────────────────────────

    @Cacheable(value = "budgets", key = "#userId + '_' + #month")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getBudgetVsActual(Long userId, String month, boolean includeAnalysis) {
        // Get saved budgets
        long dbStart = System.currentTimeMillis();
        List<Budget> budgets = budgetRepository.findByUserIdAndMonth(userId, month);
        Map<String, Double> budgetMap = new LinkedHashMap<>();
        budgets.forEach(b -> budgetMap.put(b.getCategory(), b.getBudgetAmount().doubleValue()));

        // Get actuals (DEBIT only, exclude internal categories)
        List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Double> actualMap = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (!excluded.contains(cat))
                actualMap.put(cat, ((Number) row[1]).doubleValue());
        }

        Double income = transactionRepository.getCreditTotalForRange(userId, month, month);
        double incomeVal = income != null ? income : 0.0;
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        if (budgetMap.isEmpty() || !includeAnalysis) {
            Map<String, Object> result = new HashMap<>();
            result.put("month",  month);
            result.put("budget", budgetMap);
            result.put("actual", actualMap);
            result.put("income", incomeVal);
            if (budgetMap.isEmpty()) result.put("message", "No budget set for this month");
            return result;
        }

        // Ask Gemma for narrative analysis — include income so it can assess affordability
        Map<String, Object> body = new HashMap<>();
        body.put("budget", budgetMap);
        body.put("actual", actualMap);
        body.put("month",  month);
        body.put("income", incomeVal);

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/budget-vs-actual", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        Map<String, Object> result = new HashMap<>();
        result.put("month",  month);
        result.put("budget", budgetMap);
        result.put("actual", actualMap);
        result.put("income", incomeVal);
        if (resp != null) result.putAll(resp);

        return result;
    }

    @Cacheable(value = "budget-analysis", key = "#userId + '_' + #month")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getBudgetAnalysis(Long userId, String month) {
        List<Budget> budgets = budgetRepository.findByUserIdAndMonth(userId, month);
        Map<String, Double> budgetMap = new LinkedHashMap<>();
        budgets.forEach(b -> budgetMap.put(b.getCategory(), b.getBudgetAmount().doubleValue()));

        if (budgetMap.isEmpty()) return Map.of("message", "No budget set for this month");

        Set<String> excluded = Set.of("Income", "Transfer");
        List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
        Map<String, Double> actualMap = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (!excluded.contains(cat)) actualMap.put(cat, ((Number) row[1]).doubleValue());
        }

        Double income = transactionRepository.getCreditTotalForRange(userId, month, month);
        double incomeVal = income != null ? income : 0.0;

        Map<String, Object> body = new HashMap<>();
        body.put("budget", budgetMap);
        body.put("actual", actualMap);
        body.put("month",  month);
        body.put("income", incomeVal);

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/budget-vs-actual", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        Map<String, Object> result = new HashMap<>();
        if (resp != null) result.putAll(resp);
        return result;
    }

    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "budgets",         key = "#userId + '_' + #req.month"),
        @CacheEvict(value = "budget-analysis", key = "#userId + '_' + #req.month"),
    })
    public Map<String, Object> saveBudget(Long userId, BudgetRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Replace existing budgets for this month
        long dbStart = System.currentTimeMillis();
        budgetRepository.deleteByUserIdAndMonth(userId, req.getMonth());

        List<Budget> saved = new ArrayList<>();
        req.getBudgets().forEach((category, amount) -> {
            Budget b = Budget.builder()
                    .user(user)
                    .month(req.getMonth())
                    .category(category)
                    .budgetAmount(BigDecimal.valueOf(amount))
                    .build();
            saved.add(budgetRepository.save(b));
        });
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        return Map.of(
                "month",   req.getMonth(),
                "saved",   saved.size(),
                "message", "Budget saved successfully"
        );
    }

    // ─── Spending Context (last 3 months actuals per category) ─────────────────

    public Map<String, Object> getSpendingContext(Long userId, String month) {
        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> contextMonths = allMonths.stream()
                .filter(m -> m.compareTo(month) < 0)
                .sorted()
                .collect(Collectors.toList());
        if (contextMonths.size() > 3)
            contextMonths = contextMonths.subList(contextMonths.size() - 3, contextMonths.size());

        if (contextMonths.isEmpty())
            return Map.of("months", List.of(), "categories", Map.of());

        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Map<String, Double>> perMonth = new LinkedHashMap<>();
        for (String m : contextMonths) perMonth.put(m, new LinkedHashMap<>());
        for (String m : contextMonths) {
            for (Object[] row : transactionRepository.getCategorySummaryForMonth(userId, m)) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (excluded.contains(cat)) continue;
                perMonth.get(m).put(cat, ((Number) row[1]).doubleValue());
            }
        }

        Set<String> allCats = perMonth.values().stream()
                .flatMap(m -> m.keySet().stream())
                .collect(Collectors.toCollection(LinkedHashSet::new));

        Map<String, Object> categories = new LinkedHashMap<>();
        for (String cat : allCats) {
            List<Double> amounts = new ArrayList<>();
            for (String m : contextMonths) amounts.add(round2(perMonth.get(m).getOrDefault(cat, 0.0)));

            List<Double> nonZero = amounts.stream().filter(a -> a > 0).collect(Collectors.toList());
            double avg = nonZero.stream().mapToDouble(Double::doubleValue).average().orElse(0);

            String trend = "stable";
            if (amounts.size() >= 2) {
                double last  = amounts.get(amounts.size() - 1);
                double first = amounts.stream().filter(a -> a > 0).findFirst().orElse(0.0);
                if (first > 0) {
                    double change = (last - first) / first;
                    if (change > 0.12)       trend = "increasing";
                    else if (change < -0.12) trend = "decreasing";
                }
            }

            Map<String, Object> d = new LinkedHashMap<>();
            d.put("amounts",   amounts);
            d.put("avg",       round2(avg));
            d.put("trend",     trend);
            d.put("suggested", avg > 0 ? round2(avg * 1.08) : null);
            categories.put(cat, d);
        }

        return Map.of("months", contextMonths, "categories", categories);
    }

    // ─── Budget History (multi-month summary for trend chart) ──────────────────

    public List<Map<String, Object>> getBudgetHistory(Long userId, String monthsParam) {
        List<String> months;
        if (monthsParam != null && !monthsParam.isBlank()) {
            months = Arrays.asList(monthsParam.split(","));
        } else {
            List<String> all = new ArrayList<>(transactionRepository.findDistinctMonthsByUserId(userId));
            Collections.sort(all);
            months = all.size() > 6 ? all.subList(all.size() - 6, all.size()) : all;
        }

        Set<String> excluded = Set.of("Income", "Transfer");
        List<Map<String, Object>> result = new ArrayList<>();

        for (String month : months) {
            List<Budget> budgetList = budgetRepository.findByUserIdAndMonth(userId, month);
            Map<String, Double> budgetMap = new LinkedHashMap<>();
            budgetList.forEach(b -> budgetMap.put(b.getCategory(), b.getBudgetAmount().doubleValue()));

            double totalActual = 0;
            long withinBudget = 0, budgetedCats = 0;
            for (Object[] row : transactionRepository.getCategorySummaryForMonth(userId, month)) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (excluded.contains(cat)) continue;
                double amt = ((Number) row[1]).doubleValue();
                totalActual += amt;
                if (budgetMap.containsKey(cat) && budgetMap.get(cat) > 0) {
                    budgetedCats++;
                    if (amt <= budgetMap.get(cat)) withinBudget++;
                }
            }

            double totalBudgeted = budgetMap.values().stream().mapToDouble(Double::doubleValue).sum();
            int healthScore = budgetedCats > 0 ? (int) Math.round((double) withinBudget / budgetedCats * 100) : 0;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("month",         month);
            entry.put("label",         month.substring(5));
            entry.put("totalBudgeted", round2(totalBudgeted));
            entry.put("totalActual",   round2(totalActual));
            entry.put("netDelta",      round2(totalBudgeted - totalActual));
            entry.put("healthScore",   healthScore);
            entry.put("hasBudget",     !budgetMap.isEmpty());
            result.add(entry);
        }

        return result;
    }

    // ─── Multi-Month Budget Plan ───────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> getMultiMonthPlan(Long userId, String baseMonth, int periods) {
        int safePeriods = Math.min(Math.max(periods, 1), 12);

        // Determine which months to cover
        List<String> planMonths = new ArrayList<>();
        String[] parts = baseMonth.split("-");
        int y = Integer.parseInt(parts[0]), mo = Integer.parseInt(parts[1]);
        for (int i = 0; i < safePeriods; i++) {
            planMonths.add(String.format("%04d-%02d", y, mo));
            mo++; if (mo > 12) { mo = 1; y++; }
        }

        String today = java.time.YearMonth.now().toString(); // "2026-05"

        Set<String> excluded = Set.of("Income", "Transfer");

        // ① Fetch budgets + actuals for each plan month (batch DB, fast)
        Map<String, Map<String, Double>> budgetsByMonth  = new LinkedHashMap<>();
        Map<String, Map<String, Double>> actualsByMonth  = new LinkedHashMap<>();
        for (String month : planMonths) {
            Map<String, Double> budgetMap = new LinkedHashMap<>();
            budgetRepository.findByUserIdAndMonth(userId, month)
                    .forEach(b -> budgetMap.put(b.getCategory(), b.getBudgetAmount().doubleValue()));
            budgetsByMonth.put(month, budgetMap);

            // Only query actuals for past/current months
            if (month.compareTo(today) <= 0) {
                Map<String, Double> actualMap = new LinkedHashMap<>();
                for (Object[] row : transactionRepository.getCategorySummaryForMonth(userId, month)) {
                    String cat = row[0] != null ? (String) row[0] : "Other";
                    if (!excluded.contains(cat))
                        actualMap.put(cat, ((Number) row[1]).doubleValue());
                }
                actualsByMonth.put(month, actualMap);
            } else {
                actualsByMonth.put(month, Map.of());
            }
        }

        // ② Fetch multi-period ML forecast (cached)
        Map<String, List<Double>> forecastByCategory  = new LinkedHashMap<>();
        Map<String, List<Double>> confLowByCategory   = new LinkedHashMap<>();
        Map<String, List<Double>> confHighByCategory  = new LinkedHashMap<>();
        try {
            // Re-use the same logic as getMultiPeriodForecast but inline the ML call
            List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
            List<String> historyMonths = allMonths.stream()
                    .filter(m -> m.compareTo(baseMonth) < 0)
                    .limit(36).sorted().collect(Collectors.toList());

            if (!historyMonths.isEmpty()) {
                Map<String, Map<String, Double>> perMonth = new LinkedHashMap<>();
                for (String m : historyMonths) perMonth.put(m, new LinkedHashMap<>());
                for (String m : historyMonths) {
                    for (Object[] row : transactionRepository.getCategorySummaryForMonth(userId, m)) {
                        String cat = row[0] != null ? (String) row[0] : "Other";
                        if (excluded.contains(cat)) continue;
                        perMonth.get(m).put(cat, ((Number) row[1]).doubleValue());
                    }
                }
                Set<String> allCats = perMonth.values().stream()
                        .flatMap(m -> m.keySet().stream())
                        .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
                Map<String, List<Double>> monthlyTotals = new LinkedHashMap<>();
                for (String cat : allCats) {
                    List<Double> amounts = new ArrayList<>();
                    for (String m : historyMonths) amounts.add(perMonth.get(m).getOrDefault(cat, 0.0));
                    monthlyTotals.put(cat, amounts);
                }
                String latestHistory = historyMonths.get(historyMonths.size() - 1);
                int periodsAhead = monthDiff(latestHistory, baseMonth);
                if (periodsAhead < 1) periodsAhead = 1;
                int totalPeriods = periodsAhead + safePeriods - 1;

                Map resp = mlRestTemplate.postForObject("/api/ml/forecast",
                        Map.of("monthly_totals", monthlyTotals, "periods", totalPeriods), Map.class);
                if (resp != null) {
                    Map<String, Object> forecasts = (Map<String, Object>) resp.get("forecasts");
                    if (forecasts != null) {
                        int offset = Math.max(0, periodsAhead - 1);
                        for (Map.Entry<String, Object> entry : forecasts.entrySet()) {
                            if ("_total".equals(entry.getKey())) continue;
                            Map<String, Object> catData = (Map<String, Object>) entry.getValue();
                            List<Double> fcArray = (List<Double>) catData.get("forecast");
                            if (fcArray == null) continue;
                            int from = Math.min(offset, fcArray.size() - 1);
                            int to   = Math.min(from + safePeriods, fcArray.size());
                            List<Double> window = new ArrayList<>(fcArray.subList(from, to));
                            List<Double> low = new ArrayList<>(), high = new ArrayList<>();
                            for (int i = 0; i < window.size(); i++) {
                                double fc  = window.get(i);
                                double pct = 0.10 * (i + 1);
                                low .add(round2(Math.max(0, fc * (1 - pct))));
                                high.add(round2(fc * (1 + pct)));
                                window.set(i, round2(fc));
                            }
                            forecastByCategory.put(entry.getKey(), window);
                            confLowByCategory .put(entry.getKey(), low);
                            confHighByCategory.put(entry.getKey(), high);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Multi-month plan: forecast unavailable — {}", e.getMessage());
        }

        // ③ Merge all categories found across budget, actual, forecast
        Set<String> allCats = new LinkedHashSet<>();
        budgetsByMonth.values().forEach(m -> allCats.addAll(m.keySet()));
        actualsByMonth.values().forEach(m -> allCats.addAll(m.keySet()));
        allCats.addAll(forecastByCategory.keySet());

        Map<String, Object> categories = new LinkedHashMap<>();
        for (String cat : allCats) {
            List<Double> budgetArr  = new ArrayList<>();
            List<Double> actualArr  = new ArrayList<>();
            List<Double> forecastArr = forecastByCategory.getOrDefault(cat, Collections.emptyList());
            List<Double> lowArr     = confLowByCategory .getOrDefault(cat, Collections.emptyList());
            List<Double> highArr    = confHighByCategory.getOrDefault(cat, Collections.emptyList());

            for (int i = 0; i < planMonths.size(); i++) {
                String month = planMonths.get(i);
                budgetArr .add(budgetsByMonth.get(month).getOrDefault(cat, 0.0));
                actualArr .add(actualsByMonth.get(month).getOrDefault(cat, 0.0));
            }

            Map<String, Object> catEntry = new LinkedHashMap<>();
            catEntry.put("budget",           budgetArr);
            catEntry.put("actual",           actualArr);
            catEntry.put("forecast",         forecastArr);
            catEntry.put("confidence_low",   lowArr);
            catEntry.put("confidence_high",  highArr);
            categories.put(cat, catEntry);
        }

        // ④ Compute totals
        List<Double> totalBudget = new ArrayList<>(Collections.nCopies(safePeriods, 0.0));
        List<Double> totalActual = new ArrayList<>(Collections.nCopies(safePeriods, 0.0));
        List<Double> totalFc     = new ArrayList<>(Collections.nCopies(safePeriods, 0.0));
        for (String cat : allCats) {
            Map<String, Object> cd = (Map<String, Object>) categories.get(cat);
            List<Double> b = (List<Double>) cd.get("budget");
            List<Double> a = (List<Double>) cd.get("actual");
            List<Double> f = (List<Double>) cd.get("forecast");
            for (int i = 0; i < safePeriods; i++) {
                totalBudget.set(i, round2(totalBudget.get(i) + (i < b.size() ? b.get(i) : 0)));
                totalActual.set(i, round2(totalActual.get(i) + (i < a.size() ? a.get(i) : 0)));
                totalFc    .set(i, round2(totalFc.get(i)     + (i < f.size() ? f.get(i) : 0)));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("base_month",  baseMonth);
        result.put("periods",     safePeriods);
        result.put("months",      planMonths);
        result.put("today",       today);
        result.put("categories",  categories);
        result.put("totals",      Map.of("budget", totalBudget, "actual", totalActual, "forecast", totalFc));
        return result;
    }

    @Transactional
    public Map<String, Object> saveMultiMonthBudgets(Long userId, MultiBudgetRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        int total = 0;
        for (Map.Entry<String, Map<String, Double>> entry : req.getMonths().entrySet()) {
            String month = entry.getKey();
            Map<String, Double> monthBudgets = entry.getValue();
            budgetRepository.deleteByUserIdAndMonth(userId, month);
            for (Map.Entry<String, Double> catEntry : monthBudgets.entrySet()) {
                if (catEntry.getValue() == null || catEntry.getValue() <= 0) continue;
                Budget b = Budget.builder()
                        .user(user)
                        .month(month)
                        .category(catEntry.getKey())
                        .budgetAmount(BigDecimal.valueOf(catEntry.getValue()))
                        .build();
                budgetRepository.save(b);
                total++;
            }
        }

        return Map.of("saved", total, "months", req.getMonths().size(), "message", "Multi-month budgets saved");
    }

    private int monthDiff(String from, String to) {
        String[] fp = from.split("-"), tp = to.split("-");
        return (Integer.parseInt(tp[0]) - Integer.parseInt(fp[0])) * 12
                + (Integer.parseInt(tp[1]) - Integer.parseInt(fp[1]));
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
