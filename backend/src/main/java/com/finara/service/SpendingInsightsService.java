package com.finara.service;

import com.finara.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class SpendingInsightsService {

    private final TransactionRepository transactionRepository;

    // ─── Subscriptions / Recurring Charges ───────────────────────────────────

    @Cacheable(value = "subscriptions", key = "#userId")
    public Map<String, Object> getRecurringCharges(Long userId) {
        List<Object[]> rows = transactionRepository.findRecurringCharges(userId);
        LocalDate sixtyDaysAgo = LocalDate.now().minusDays(60);

        List<Map<String, Object>> subscriptions = new ArrayList<>();
        double totalMonthly = 0;
        long newCount = 0;

        for (Object[] row : rows) {
            String name           = (String) row[0];
            int    monthCount     = ((Number) row[1]).intValue();
            int    occurrenceCount= ((Number) row[2]).intValue();
            double avgAmount      = ((Number) row[3]).doubleValue();
            double maxAmount      = ((Number) row[4]).doubleValue();
            double minAmount      = ((Number) row[5]).doubleValue();
            LocalDate lastSeen    = toLocalDate(row[6]);
            LocalDate firstSeen   = toLocalDate(row[7]);
            String category       = row[8] != null ? (String) row[8] : "Other";

            boolean isNew = firstSeen != null && firstSeen.isAfter(sixtyDaysAgo);
            // Amount varies slightly month-to-month for some subs (e.g. usage-based)
            String amountLabel = (maxAmount - minAmount < 1.0) ? "fixed" : "variable";
            String frequency   = occurrenceCount <= monthCount + 1 ? "Monthly" : "Multiple/month";

            long roundedAmount = Math.round(avgAmount);

            Map<String, Object> sub = new LinkedHashMap<>();
            sub.put("name",            toTitleCase(name));
            sub.put("normalizedName",  name);           // raw LOWER(TRIM(description)) for lookup
            sub.put("roundedAmount",   roundedAmount);  // used to disambiguate same merchant, different tiers
            sub.put("amount",          round2(avgAmount));
            sub.put("amountMin",       round2(minAmount));
            sub.put("amountMax",       round2(maxAmount));
            sub.put("amountLabel",     amountLabel);
            sub.put("monthCount",      monthCount);
            sub.put("occurrenceCount", occurrenceCount);
            sub.put("lastSeen",        lastSeen != null  ? lastSeen.toString()  : null);
            sub.put("firstSeen",       firstSeen != null ? firstSeen.toString() : null);
            sub.put("category",        category);
            sub.put("isNew",           isNew);
            sub.put("frequency",       frequency);
            subscriptions.add(sub);

            totalMonthly += avgAmount;
            if (isNew) newCount++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("subscriptions", subscriptions);
        result.put("totalMonthly",  round2(totalMonthly));
        result.put("count",         subscriptions.size());
        result.put("newCount",      newCount);
        return result;
    }

    // ─── Subscription Transaction Drill-Down ─────────────────────────────────

    public List<Map<String, Object>> getSubscriptionTransactions(Long userId, String normalizedName) {
        List<Object[]> rows = transactionRepository.findSubscriptionTransactions(userId, normalizedName);

        return rows.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          ((Number) r[0]).longValue());
            m.put("date",        r[1] != null ? r[1].toString() : null);
            m.put("description", (String) r[2]);
            m.put("amount",      r[3] != null ? round2(((Number) r[3]).doubleValue()) : 0.0);
            return m;
        }).collect(Collectors.toList());
    }

    // ─── Merchant Leaderboard ─────────────────────────────────────────────────

    @Cacheable(value = "merchant-leaderboard", key = "#userId + '_' + #startMonth + '_' + #endMonth")
    public Map<String, Object> getMerchantLeaderboard(Long userId, String startMonth, String endMonth) {
        // Current period
        List<Object[]> current = transactionRepository.getMerchantLeaderboard(userId, startMonth, endMonth);

        // Prior period (same length, shifted back)
        YearMonth start         = YearMonth.parse(startMonth);
        YearMonth end           = YearMonth.parse(endMonth);
        long intervalMonths     = ChronoUnit.MONTHS.between(start, end) + 1;
        String priorStart       = start.minusMonths(intervalMonths).toString();
        String priorEnd         = end.minusMonths(intervalMonths).toString();

        Map<String, Double> priorTotals = transactionRepository
                .getMerchantTotalsForPeriod(userId, priorStart, priorEnd)
                .stream()
                .collect(Collectors.toMap(
                        r -> (String) r[0],
                        r -> ((Number) r[1]).doubleValue(),
                        (a, b) -> a
                ));

        double grandTotal = current.stream()
                .mapToDouble(r -> ((Number) r[1]).doubleValue())
                .sum();

        List<Map<String, Object>> merchants = new ArrayList<>();
        for (int i = 0; i < current.size(); i++) {
            Object[] row        = current.get(i);
            String description  = (String) row[0];
            double totalSpend   = ((Number) row[1]).doubleValue();
            int    visitCount   = ((Number) row[2]).intValue();
            double avgPerVisit  = ((Number) row[3]).doubleValue();
            String category     = row[4] != null ? (String) row[4] : "Other";

            double priorSpend   = priorTotals.getOrDefault(description, 0.0);
            String trend        = computeTrend(totalSpend, priorSpend);
            double trendPct     = priorSpend > 0
                    ? ((totalSpend - priorSpend) / priorSpend) * 100
                    : 0.0;
            double pctOfTotal   = grandTotal > 0 ? (totalSpend / grandTotal) * 100 : 0.0;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rank",         i + 1);
            m.put("name",         description);
            m.put("totalSpend",   round2(totalSpend));
            m.put("visitCount",   visitCount);
            m.put("avgPerVisit",  round2(avgPerVisit));
            m.put("category",     category);
            m.put("pctOfTotal",   round1(pctOfTotal));
            m.put("trend",        trend);
            m.put("trendPct",     round1(trendPct));
            m.put("priorSpend",   round2(priorSpend));
            merchants.add(m);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("merchants",    merchants);
        result.put("totalSpend",   round2(grandTotal));
        result.put("merchantCount",merchants.size());
        result.put("period",       Map.of("start", startMonth, "end", endMonth));
        result.put("priorPeriod",  Map.of("start", priorStart, "end", priorEnd));
        return result;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private String computeTrend(double current, double prior) {
        if (prior == 0) return "new";
        if (current > prior * 1.05) return "up";
        if (current < prior * 0.95) return "down";
        return "flat";
    }

    private LocalDate toLocalDate(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Date) return ((java.sql.Date) o).toLocalDate();
        try { return LocalDate.parse(o.toString()); } catch (Exception e) { return null; }
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private double round1(double v) { return Math.round(v * 10.0)  / 10.0;  }

    private String toTitleCase(String input) {
        if (input == null || input.isBlank()) return input;
        return Arrays.stream(input.split("\\s+"))
                .filter(w -> !w.isEmpty())
                .map(w -> Character.toUpperCase(w.charAt(0)) + w.substring(1).toLowerCase())
                .collect(Collectors.joining(" "));
    }
}
