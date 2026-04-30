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
        // Get last 4 months of data
        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> historyMonths = allMonths.stream()
                .filter(m -> m.compareTo(targetMonth) < 0)
                .limit(4)
                .sorted()
                .collect(Collectors.toList());

        if (historyMonths.isEmpty()) {
            return Map.of("error", "Not enough historical data for forecast");
        }

        // Build monthly totals per category
        long dbStart = System.currentTimeMillis();
        Map<String, List<Double>> monthlyTotals = new LinkedHashMap<>();
        for (String month : historyMonths) {
            List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
            for (Object[] row : rows) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                double amt = ((Number) row[1]).doubleValue();
                monthlyTotals.computeIfAbsent(cat, k -> new ArrayList<>()).add(amt);
            }
        }
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        Map<String, Object> body = Map.of(
                "monthly_totals", monthlyTotals,
                "periods", 1
        );

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ml/forecast", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);
        return resp != null ? resp : Map.of("error", "Forecast service unavailable");
    }
}
