package com.finara.service;

import com.finara.config.TimingContext;
import com.finara.model.FinancialReport;
import com.finara.repository.FinancialReportRepository;
import com.finara.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import java.util.Set;

@Service
@Slf4j
@RequiredArgsConstructor
public class ReportService {

    private final TransactionRepository transactionRepository;
    private final FinancialReportRepository financialReportRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    // ─── UC3: Compare Reports ─────────────────────────────────────────────────

    public List<Map<String, Object>> getReports(Long userId, String monthsParam) {
        List<String> months = monthsParam != null
                ? Arrays.asList(monthsParam.split(","))
                : transactionRepository.findDistinctMonthsByUserId(userId)
                        .stream().limit(3).collect(Collectors.toList());

        return months.stream().map(month -> getReport(userId, month)).collect(Collectors.toList());
    }

    @Cacheable(value = "reports", key = "#userId + '_' + #month")
    public Map<String, Object> getReport(Long userId, String month) {
        long dbStart = System.currentTimeMillis();
        List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);

        // Exclude internal tracking categories from spending view
        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Double> categories = new LinkedHashMap<>();
        double total = 0;
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            double amt = ((Number) row[1]).doubleValue();
            if (!excluded.contains(cat)) {
                categories.put(cat, amt);
                total += amt;
            }
        }

        Double income = transactionRepository.getCreditTotalForRange(userId, month, month);
        double incomeVal = income != null ? income : 0.0;
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month",      month);
        result.put("categories", categories);
        result.put("total",      total);
        result.put("income",     incomeVal);
        result.put("net",        incomeVal - total);
        return result;
    }

    public Map<String, Object> getReportWithNarrative(Long userId, String month) {
        Map<String, Object> result = new LinkedHashMap<>(getReport(userId, month));
        long dbStart = System.currentTimeMillis();
        financialReportRepository.findByUserIdAndMonth(userId, month)
                .map(FinancialReport::getNarrativeStory)
                .filter(n -> n != null && !n.isBlank())
                .ifPresent(narrative -> result.put("narrative", narrative));
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        // Attach highlights so cached story loads have the same shape as fresh generations
        result.put("highlights", buildHighlightsFromReport(result));
        return result;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildHighlightsFromReport(Map<String, Object> report) {
        List<Map<String, Object>> highlights = new ArrayList<>();

        double total  = ((Number) report.getOrDefault("total",  0.0)).doubleValue();
        double income = ((Number) report.getOrDefault("income", 0.0)).doubleValue();
        double net    = ((Number) report.getOrDefault("net",    0.0)).doubleValue();
        Map<String, Double> cats = (Map<String, Double>) report.getOrDefault("categories", Map.of());

        highlights.add(Map.of("label", "Total Spent",   "value", fmtCurrency(total),  "type", "neutral"));

        String sign  = net >= 0 ? "+" : "-";
        String label = net >= 0 ? "surplus" : "deficit";
        highlights.add(Map.of("label", "Net Cash Flow",
                "value", sign + fmtCurrency(Math.abs(net)) + " " + label,
                "type",  net >= 0 ? "positive" : "negative"));

        cats.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(top -> highlights.add(Map.of(
                        "label", "Top Spending",
                        "value", top.getKey() + " · " + fmtCurrency(top.getValue()),
                        "type",  "info")));

        return highlights;
    }

    private String fmtCurrency(double amount) {
        return "$" + String.format("%,.0f", amount);
    }

    // ─── Compare: bulk daily data (single DB call for all months) ─────────────

    public Map<String, Object> getDailySpendingBulk(Long userId, String monthsParam) {
        List<String> months = Arrays.stream(monthsParam.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).sorted().collect(Collectors.toList());
        if (months.isEmpty()) return Map.of();

        LocalDate startDate = YearMonth.parse(months.get(0)).atDay(1);
        LocalDate endDate   = YearMonth.parse(months.get(months.size() - 1)).atEndOfMonth().plusDays(1);

        List<Object[]> rows = transactionRepository.getDailySpendingInRange(userId, startDate, endDate);

        Map<String, Map<Integer, Double>> byMonth = new LinkedHashMap<>();
        months.forEach(m -> byMonth.put(m, new LinkedHashMap<>()));

        for (Object[] row : rows) {
            LocalDate date = ((java.sql.Date) row[0]).toLocalDate();
            String m = String.format("%d-%02d", date.getYear(), date.getMonthValue());
            if (byMonth.containsKey(m)) {
                byMonth.get(m).merge(date.getDayOfMonth(), ((Number) row[1]).doubleValue(), Double::sum);
            }
        }

        return new LinkedHashMap<>(byMonth);
    }

    // ─── Compare: AI insights (Gemma, cached) ─────────────────────────────────

    @Cacheable(value = "compare-insights", key = "#userId + '_' + #monthsParam")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getCompareInsights(Long userId, String monthsParam) {
        List<String> months = Arrays.stream(monthsParam.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).sorted().collect(Collectors.toList());
        if (months.size() < 2) return Map.of("error", "Need at least 2 months");

        List<Map<String, Object>> monthData = months.stream()
                .map(m -> getReport(userId, m)).collect(Collectors.toList());

        Map<String, Object> body = new HashMap<>();
        body.put("months", monthData);

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/compare", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        return resp != null ? resp : Map.of("error", "AI compare unavailable");
    }

    // ─── UC6: Forecast ───────────────────────────────────────────────────────

    @Caching(evict = {
        @CacheEvict(value = "forecasts",               key = "#userId + '_' + #targetMonth"),
        @CacheEvict(value = "daily-forecasts",         key = "#userId + '_' + #targetMonth"),
        @CacheEvict(value = "budget-suggestions",      key = "#userId + '_' + #targetMonth"),
        @CacheEvict(value = "multi-period-forecasts",  allEntries = true),
        @CacheEvict(value = "forecast-seasonality",    key = "#userId"),
        @CacheEvict(value = "forecast-accuracy",       key = "#userId"),
    })
    public void evictForecastCache(Long userId, String targetMonth) {}

    @Cacheable(value = "forecasts", key = "#userId + '_' + #targetMonth")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getForecast(Long userId, String targetMonth) {
        // Use up to 36 months of history to allow Holt-Winters seasonal model (needs 24+)
        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> historyMonths = allMonths.stream()
                .filter(m -> m.compareTo(targetMonth) < 0)
                .limit(36)
                .sorted()
                .collect(Collectors.toList());

        if (historyMonths.isEmpty()) {
            return Map.of("error", "Not enough historical data for forecast");
        }

        // Build per-month, per-category map — excluding non-spending categories
        long dbStart = System.currentTimeMillis();
        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Map<String, Double>> perMonth = new LinkedHashMap<>();
        for (String month : historyMonths) {
            perMonth.put(month, new LinkedHashMap<>());
        }
        for (String month : historyMonths) {
            List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
            for (Object[] row : rows) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (excluded.contains(cat)) continue;
                double amt = ((Number) row[1]).doubleValue();
                perMonth.get(month).put(cat, amt);
            }
        }

        // Collect all spending categories seen across any month
        Set<String> allCats = perMonth.values().stream()
                .flatMap(m -> m.keySet().stream())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        // Zero-fill: every category gets an entry for every month so arrays are equal length.
        // This fixes the zip() issue in the ML service where sparse categories (e.g. Travel)
        // cause _total to be computed from only N=2 data points instead of 36.
        Map<String, List<Double>> monthlyTotals = new LinkedHashMap<>();
        for (String cat : allCats) {
            List<Double> amounts = new ArrayList<>();
            for (String month : historyMonths) {
                amounts.add(perMonth.get(month).getOrDefault(cat, 0.0));
            }
            monthlyTotals.put(cat, amounts);
        }
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        // Calculate how many periods ahead the target month is from the latest history month
        String latestHistory = historyMonths.get(historyMonths.size() - 1);
        int periodsAhead = monthDiff(latestHistory, targetMonth);
        if (periodsAhead < 1) periodsAhead = 1;

        Map<String, Object> body = Map.of(
                "monthly_totals", monthlyTotals,
                "periods", periodsAhead
        );

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ml/forecast", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        return resp != null ? resp : Map.of("error", "Forecast service unavailable");
    }

    // ─── UC6b: Daily Forecast ────────────────────────────────────────────────

    @Cacheable(value = "daily-forecasts", key = "#userId + '_' + #targetMonth")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getDailyForecast(Long userId, String targetMonth) {
        LocalDate targetStart = LocalDate.parse(targetMonth + "-01");
        LocalDate histStart   = targetStart.minusDays(180); // 6 months of daily history

        long dbStart = System.currentTimeMillis();
        List<Object[]> rows = transactionRepository.getDailySpendingInRange(userId, histStart, targetStart);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        if (rows.isEmpty()) {
            return Map.of("error", "Not enough daily data for forecast");
        }

        java.util.TreeMap<LocalDate, Double> dateMap = new java.util.TreeMap<>();
        for (Object[] row : rows) {
            LocalDate date = (row[0] instanceof java.sql.Date)
                    ? ((java.sql.Date) row[0]).toLocalDate()
                    : LocalDate.parse(row[0].toString());
            dateMap.put(date, ((Number) row[1]).doubleValue());
        }

        List<Double> series = new ArrayList<>();
        LocalDate cur = dateMap.firstKey();
        LocalDate end = targetStart.minusDays(1);
        while (!cur.isAfter(end)) {
            series.add(dateMap.getOrDefault(cur, 0.0));
            cur = cur.plusDays(1);
        }

        int daysInMonth = targetStart.getMonth().length(targetStart.isLeapYear());
        String seriesStartDate = dateMap.firstKey().toString(); // YYYY-MM-DD of first history day

        Map<String, Object> body = Map.of(
                "daily_totals", series,
                "periods",      daysInMonth,
                "start_date",   seriesStartDate
        );
        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ml/forecast/daily", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        return resp != null ? resp : Map.of("error", "Daily forecast service unavailable");
    }

    // ─── Date-range Forecast ─────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> getForecastRange(Long userId, String startDateStr, String endDateStr) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate   = LocalDate.parse(endDateStr);

        if (startDate.isAfter(endDate)) {
            return Map.of("error", "startDate must be before or equal to endDate");
        }
        if (ChronoUnit.DAYS.between(startDate, endDate) >= 365) {
            return Map.of("error", "Date range cannot exceed 365 days");
        }

        // Collect all months the range spans
        List<YearMonth> monthsInRange = new ArrayList<>();
        YearMonth cur = YearMonth.from(startDate);
        YearMonth last = YearMonth.from(endDate);
        while (!cur.isAfter(last)) { monthsInRange.add(cur); cur = cur.plusMonths(1); }

        List<Map<String, Object>> days = new ArrayList<>();
        double totalFc = 0, totalLo = 0, totalHi = 0;

        for (YearMonth ym : monthsInRange) {
            Map<String, Object> daily = getDailyForecast(userId, ym.toString());
            if (daily.containsKey("error")) continue;

            List<Double> fc  = (List<Double>) daily.get("forecast");
            List<Double> clo = (List<Double>) daily.get("confidence_low");
            List<Double> chi = (List<Double>) daily.get("confidence_high");
            if (fc == null) continue;

            LocalDate monthStart = ym.atDay(1);
            LocalDate monthEnd   = ym.atEndOfMonth();
            LocalDate from = startDate.isAfter(monthStart) ? startDate : monthStart;
            LocalDate to   = endDate.isBefore(monthEnd)    ? endDate   : monthEnd;

            LocalDate d = from;
            while (!d.isAfter(to)) {
                int idx = d.getDayOfMonth() - 1;
                double fv = idx < fc.size()  ? fc.get(idx)  : 0;
                double lv = clo != null && idx < clo.size() ? clo.get(idx) : Math.max(0, fv * 0.85);
                double hv = chi != null && idx < chi.size() ? chi.get(idx) : fv * 1.15;

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("date",     d.toString());
                entry.put("forecast", round2(fv));
                entry.put("confLow",  round2(lv));
                entry.put("confHigh", round2(hv));
                days.add(entry);

                totalFc += fv; totalLo += lv; totalHi += hv;
                d = d.plusDays(1);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("startDate",     startDateStr);
        result.put("endDate",       endDateStr);
        result.put("totalDays",     days.size());
        result.put("totalForecast", round2(totalFc));
        result.put("totalConfLow",  round2(totalLo));
        result.put("totalConfHigh", round2(totalHi));
        result.put("days",          days);
        return result;
    }

    // ─── Seasonality Profile ─────────────────────────────────────────────────

    @Cacheable(value = "forecast-seasonality", key = "#userId")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getSeasonalityProfile(Long userId) {
        List<String> allMonths = new ArrayList<>(transactionRepository.findDistinctMonthsByUserId(userId));
        Collections.sort(allMonths);
        if (allMonths.size() < 12) {
            return Map.of("error", "Need at least 12 months of data", "actual_months", allMonths.size());
        }

        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Map<String, Double>> perMonth = new LinkedHashMap<>();
        for (String m : allMonths) perMonth.put(m, new LinkedHashMap<>());
        for (String m : allMonths) {
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
            for (String m : allMonths) amounts.add(perMonth.get(m).getOrDefault(cat, 0.0));
            monthlyTotals.put(cat, amounts);
        }

        Map<String, Object> body = Map.of("monthly_totals", monthlyTotals, "month_labels", allMonths);
        Map resp = mlRestTemplate.postForObject("/api/ml/forecast/seasonality", body, Map.class);
        return resp != null ? resp : Map.of("error", "Seasonality service unavailable");
    }

    // ─── Multi-Period Forecast ────────────────────────────────────────────────

    @Cacheable(value = "multi-period-forecasts", key = "#userId + '_' + #baseMonth + '_' + #periods")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getMultiPeriodForecast(Long userId, String baseMonth, int periods) {
        int safePeriods = Math.min(Math.max(periods, 1), 12);

        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> historyMonths = allMonths.stream()
                .filter(m -> m.compareTo(baseMonth) < 0)
                .limit(36).sorted().collect(Collectors.toList());

        if (historyMonths.isEmpty()) return Map.of("error", "Not enough historical data");

        Set<String> excluded = Set.of("Income", "Transfer");
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
        if (resp == null) return Map.of("error", "Forecast service unavailable");

        Map<String, Object> forecasts = (Map<String, Object>) resp.get("forecasts");
        if (forecasts == null) return resp;

        // Month labels for the requested window
        List<String> forecastMonths = new ArrayList<>();
        String[] parts = baseMonth.split("-");
        int y = Integer.parseInt(parts[0]), mo = Integer.parseInt(parts[1]);
        for (int i = 0; i < safePeriods; i++) {
            forecastMonths.add(String.format("%04d-%02d", y, mo));
            mo++; if (mo > 12) { mo = 1; y++; }
        }

        int offset = Math.max(0, periodsAhead - 1);
        Map<String, Object> trimmed = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : forecasts.entrySet()) {
            Map<String, Object> catData = new LinkedHashMap<>((Map<String, Object>) entry.getValue());
            List<Double> fcArray = (List<Double>) catData.get("forecast");
            if (fcArray == null) { trimmed.put(entry.getKey(), catData); continue; }

            int from = Math.min(offset, fcArray.size() - 1);
            int to   = Math.min(from + safePeriods, fcArray.size());
            List<Double> window = new ArrayList<>(fcArray.subList(from, to));

            // Confidence bands widen ±10% per additional period
            List<Double> widenLow = new ArrayList<>(), widenHigh = new ArrayList<>();
            for (int i = 0; i < window.size(); i++) {
                double fc  = window.get(i);
                double pct = 0.10 * (i + 1);
                widenLow .add(round2(Math.max(0, fc * (1 - pct))));
                widenHigh.add(round2(fc * (1 + pct)));
            }
            catData.put("forecast",                 window);
            catData.put("confidence_low_series",    widenLow);
            catData.put("confidence_high_series",   widenHigh);
            trimmed.put(entry.getKey(), catData);
        }

        Map<String, Object> result = new LinkedHashMap<>((Map<String, Object>) resp);
        result.put("forecasts",       trimmed);
        result.put("forecast_months", forecastMonths);
        result.put("periods",         safePeriods);
        result.put("base_month",      baseMonth);
        return result;
    }

    // ─── Smart Budget Suggest ─────────────────────────────────────────────────

    @Cacheable(value = "budget-suggestions", key = "#userId + '_' + #month")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getBudgetSuggestions(Long userId, String month) {
        Map<String, Object> fc = getForecast(userId, month);
        if (fc.containsKey("error")) return fc;

        Map<String, Object> forecasts = (Map<String, Object>) fc.get("forecasts");
        if (forecasts == null) return Map.of("error", "No forecast data");

        Map<String, Double> suggestions = new LinkedHashMap<>();
        Map<String, Object> reasoning   = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : forecasts.entrySet()) {
            if ("_total".equals(entry.getKey())) continue;
            Map<String, Object> catData = (Map<String, Object>) entry.getValue();

            double forecast = ((Number) catData.getOrDefault("target_value", 0)).doubleValue();
            String trend    = (String) catData.getOrDefault("trend", "stable");
            double histAvg  = ((Number) catData.getOrDefault("historical_avg", 0)).doubleValue();
            if (forecast <= 0) continue;

            // Rising: +15% buffer, stable: +8%, decreasing: 0%
            double buffer    = "increasing".equals(trend) ? 0.15 : "stable".equals(trend) ? 0.08 : 0.0;
            double suggested = round2(forecast * (1 + buffer));
            suggestions.put(entry.getKey(), suggested);

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("forecast",   round2(forecast));
            r.put("suggested",  suggested);
            r.put("buffer_pct", (int) Math.round(buffer * 100));
            r.put("trend",      trend);
            r.put("hist_avg",   round2(histAvg));
            reasoning.put(entry.getKey(), r);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month",       month);
        result.put("suggestions", suggestions);
        result.put("reasoning",   reasoning);
        result.put("total",       round2(suggestions.values().stream().mapToDouble(Double::doubleValue).sum()));
        return result;
    }

    // ─── Forecast Accuracy ────────────────────────────────────────────────────

    @Cacheable(value = "forecast-accuracy", key = "#userId")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getForecastAccuracy(Long userId) {
        List<String> allMonths = new ArrayList<>(transactionRepository.findDistinctMonthsByUserId(userId));
        Collections.sort(allMonths);

        if (allMonths.size() < 3) {
            return Map.of("error", "Need at least 3 months of data for accuracy evaluation");
        }

        Set<String> excluded  = Set.of("Income", "Transfer");
        int evalCount         = Math.min(3, allMonths.size() - 1);
        List<String> evalMonths = allMonths.subList(allMonths.size() - evalCount, allMonths.size());

        List<Map<String, Object>> monthResults = new ArrayList<>();
        List<Double> mapeValues = new ArrayList<>();

        for (String evalMonth : evalMonths) {
            List<String> histMonths = allMonths.stream()
                    .filter(m -> m.compareTo(evalMonth) < 0)
                    .limit(36).collect(Collectors.toList());
            if (histMonths.size() < 2) continue;

            Map<String, Map<String, Double>> perMonth = new LinkedHashMap<>();
            for (String m : histMonths) perMonth.put(m, new LinkedHashMap<>());
            for (String m : histMonths) {
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
                for (String m : histMonths) amounts.add(perMonth.get(m).getOrDefault(cat, 0.0));
                monthlyTotals.put(cat, amounts);
            }

            String latestHistory = histMonths.get(histMonths.size() - 1);
            int periodsAhead = monthDiff(latestHistory, evalMonth);
            if (periodsAhead < 1) periodsAhead = 1;

            try {
                Map resp = mlRestTemplate.postForObject("/api/ml/forecast",
                        Map.of("monthly_totals", monthlyTotals, "periods", periodsAhead), Map.class);
                if (resp == null) continue;

                Map<String, Object> fcMap   = (Map<String, Object>) resp.get("forecasts");
                if (fcMap == null) continue;
                Map<String, Object> totalFc = (Map<String, Object>) fcMap.get("_total");
                if (totalFc == null) continue;

                double forecastVal = ((Number) totalFc.getOrDefault("target_value", 0)).doubleValue();

                double actualTotal = 0;
                for (Object[] row : transactionRepository.getCategorySummaryForMonth(userId, evalMonth)) {
                    String cat = row[0] != null ? (String) row[0] : "Other";
                    if (excluded.contains(cat)) continue;
                    actualTotal += ((Number) row[1]).doubleValue();
                }
                if (actualTotal <= 0) continue;

                double mape     = Math.abs((actualTotal - forecastVal) / actualTotal) * 100;
                double confLow  = ((Number) totalFc.getOrDefault("confidence_low",  0.0)).doubleValue();
                double confHigh = ((Number) totalFc.getOrDefault("confidence_high", Double.MAX_VALUE)).doubleValue();
                mapeValues.add(mape);

                Map<String, Object> mr = new LinkedHashMap<>();
                mr.put("month",       evalMonth);
                mr.put("forecast",    round2(forecastVal));
                mr.put("actual",      round2(actualTotal));
                mr.put("mape",        round2(mape));
                mr.put("error_pct",   round2((forecastVal - actualTotal) / actualTotal * 100));
                mr.put("within_band", actualTotal >= confLow && actualTotal <= confHigh);
                monthResults.add(mr);
            } catch (Exception e) {
                log.warn("Accuracy eval skipped for {}: {}", evalMonth, e.getMessage());
            }
        }

        if (mapeValues.isEmpty()) return Map.of("error", "Could not compute accuracy — check ML service");

        double overall = mapeValues.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        String grade   = overall < 10 ? "A" : overall < 20 ? "B" : overall < 30 ? "C" : "D";

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("overall_mape",     round2(overall));
        result.put("grade",            grade);
        result.put("months_evaluated", monthResults.size());
        result.put("month_results",    monthResults);
        return result;
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }

    private int monthDiff(String from, String to) {
        String[] f = from.split("-");
        String[] t = to.split("-");
        int fy = Integer.parseInt(f[0]), fm = Integer.parseInt(f[1]);
        int ty = Integer.parseInt(t[0]), tm = Integer.parseInt(t[1]);
        return (ty - fy) * 12 + (tm - fm);
    }
}
