package com.finara.service;

import com.finara.config.TimingContext;
import com.finara.model.FinancialReport;
import com.finara.repository.FinancialReportRepository;
import com.finara.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
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
        return result;
    }

    // ─── UC6: Forecast ───────────────────────────────────────────────────────

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

    private int monthDiff(String from, String to) {
        String[] f = from.split("-");
        String[] t = to.split("-");
        int fy = Integer.parseInt(f[0]), fm = Integer.parseInt(f[1]);
        int ty = Integer.parseInt(t[0]), tm = Integer.parseInt(t[1]);
        return (ty - fy) * 12 + (tm - fm);
    }
}
