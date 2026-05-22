package com.finara.controller;

import com.finara.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Internal service-to-service endpoint — called by ml-service to fetch live transaction data.
 * Secured via X-Service-Token header (no JWT required, but token must match service.token config).
 */
@RestController
@RequestMapping("/api/service")
@RequiredArgsConstructor
@Slf4j
public class ServiceDataController {

    private final TransactionRepository transactionRepository;

    @Value("${service.token:finara_internal_svc_token_2026}")
    private String serviceToken;

    private static final String[] MONTH_NAMES =
        {"", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    private static final Set<String> EXCL = Set.of("Income", "Transfer");

    @PostMapping("/query")
    public ResponseEntity<?> query(
            @RequestHeader(value = "X-Service-Token", required = false) String token,
            @RequestBody Map<String, Object> body) {

        if (!serviceToken.equals(token)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
        }

        Object rawId = body.get("user_id");
        if (rawId == null) return ResponseEntity.badRequest().body(Map.of("error", "user_id required"));
        Long userId = ((Number) rawId).longValue();

        String type = (String) body.get("type");
        if (type == null) return ResponseEntity.badRequest().body(Map.of("error", "type required"));

        @SuppressWarnings("unchecked")
        Map<String, Object> params = body.containsKey("params")
                ? (Map<String, Object>) body.get("params")
                : Map.of();

        try {
            return switch (type) {
                case "year_over_year"      -> ResponseEntity.ok(yearOverYear(userId, params));
                case "daily_by_year"       -> ResponseEntity.ok(dailyByYear(userId, params));
                case "monthly_totals"      -> ResponseEntity.ok(monthlyTotals(userId, params));
                case "category_breakdown"  -> ResponseEntity.ok(categoryBreakdown(userId, params));
                case "daily_totals"        -> ResponseEntity.ok(dailyTotals(userId, params));
                case "available_months"    -> ResponseEntity.ok(availableMonths(userId));
                case "transaction_search"  -> ResponseEntity.ok(transactionSearch(userId, params));
                case "calendar_heatmap"    -> ResponseEntity.ok(calendarHeatmap(userId, params));
                default -> ResponseEntity.badRequest().body(Map.of("error", "Unknown type: " + type));
            };
        } catch (Exception e) {
            log.error("ServiceData error user={} type={}: {}", userId, type, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Query handlers ────────────────────────────────────────────────────────

    private Map<String, Object> yearOverYear(Long userId, Map<String, Object> params) {
        String monthNum = (String) params.getOrDefault("month_num", "01"); // "05" → May

        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> matching = allMonths.stream()
                .filter(m -> m.length() == 7 && m.substring(5).equals(monthNum))
                .sorted()
                .collect(Collectors.toList());

        // Fallback: return all months if the specific month isn't found across years
        if (matching.isEmpty()) matching = allMonths.stream().sorted().collect(Collectors.toList());

        List<Map<String, Object>> data = new ArrayList<>();
        for (String month : matching) {
            List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
            double total = rows.stream()
                    .filter(r -> r[0] == null || !EXCL.contains((String) r[0]))
                    .mapToDouble(r -> ((Number) r[1]).doubleValue()).sum();

            Map<String, Double> cats = new LinkedHashMap<>();
            for (Object[] row : rows) {
                String cat = row[0] != null ? (String) row[0] : "Other";
                if (!EXCL.contains(cat)) cats.put(cat, round2(((Number) row[1]).doubleValue()));
            }

            int mo = Integer.parseInt(month.substring(5));
            String label = MONTH_NAMES[mo] + " " + month.substring(0, 4);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("month",      month);
            entry.put("label",      label);
            entry.put("total",      round2(total));
            entry.put("categories", cats);
            data.add(entry);
        }

        return Map.of("type", "year_over_year", "month_num", monthNum, "data", data);
    }

    /**
     * For a given calendar month (e.g. "06" = June), fetch each day's spending for every
     * year that has data. Returns chart-ready rows: [{day:1, "2023":45.0, "2024":32.0, ...}]
     * so the frontend can render one line per year with X = day-of-month.
     */
    private Map<String, Object> dailyByYear(Long userId, Map<String, Object> params) {
        String monthNum = (String) params.getOrDefault("month_num", "01"); // "06" = June

        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> matching  = allMonths.stream()
                .filter(m -> m.length() == 7 && m.substring(5).equals(monthNum))
                .sorted()
                .collect(Collectors.toList());

        if (matching.isEmpty()) {
            return Map.of("type", "daily_by_year", "month_num", monthNum,
                          "years", List.of(), "data", List.of());
        }

        double minAmount = params.containsKey("min_amount") ? ((Number) params.get("min_amount")).doubleValue() : 0.0;
        double maxAmount = params.containsKey("max_amount") ? ((Number) params.get("max_amount")).doubleValue() : 1_000_000_000.0;
        boolean bounded  = params.containsKey("min_amount") || params.containsKey("max_amount");

        // Fetch daily rows per year
        List<String> years = new ArrayList<>();
        Map<String, Map<Integer, Double>> yearDayMap = new LinkedHashMap<>(); // year → {day → amount}

        for (String month : matching) {
            String year       = month.substring(0, 4);
            LocalDate start   = LocalDate.parse(month + "-01");
            LocalDate end     = start.plusMonths(1);
            List<Object[]> rows = bounded
                    ? transactionRepository.getDailySpendingInRangeBounded(userId, start, end, minAmount, maxAmount)
                    : transactionRepository.getDailySpendingInRange(userId, start, end);

            Map<Integer, Double> dayAmounts = new LinkedHashMap<>();
            for (Object[] row : rows) {
                int    day    = Integer.parseInt(row[0].toString().substring(8)); // day of month from date
                double amount = round2(((Number) row[1]).doubleValue());
                dayAmounts.put(day, amount);
            }
            years.add(year);
            yearDayMap.put(year, dayAmounts);
        }

        // Find max days in any of the matching months
        int maxDay = matching.stream()
                .mapToInt(m -> LocalDate.parse(m + "-01").lengthOfMonth())
                .max().orElse(30);

        // Build chart rows: [{day:1, "2023":X, "2024":Y}, ...]
        List<Map<String, Object>> data = new ArrayList<>();
        for (int d = 1; d <= maxDay; d++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("day", d);
            for (String year : years) {
                row.put(year, yearDayMap.get(year).getOrDefault(d, 0.0));
            }
            data.add(row);
        }

        return Map.of("type", "daily_by_year", "month_num", monthNum, "years", years, "data", data);
    }

    private Map<String, Object> monthlyTotals(Long userId, Map<String, Object> params) {
        int count = params.containsKey("count") ? ((Number) params.get("count")).intValue() : 12;
        String startMonth = (String) params.get("start_month");
        String endMonth   = (String) params.get("end_month");

        List<String> allMonths = transactionRepository.findDistinctMonthsByUserId(userId);
        List<String> months;
        if (startMonth != null && endMonth != null) {
            final String sm = startMonth, em = endMonth;
            months = allMonths.stream()
                    .filter(m -> m.compareTo(sm) >= 0 && m.compareTo(em) <= 0)
                    .sorted().collect(Collectors.toList());
        } else {
            months = allMonths.stream().limit(count).sorted().collect(Collectors.toList());
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (String m : months) {
            List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, m);
            double total = rows.stream()
                    .filter(r -> r[0] == null || !EXCL.contains((String) r[0]))
                    .mapToDouble(r -> ((Number) r[1]).doubleValue()).sum();
            Double inc = transactionRepository.getCreditTotalForRange(userId, m, m);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("month",  m);
            entry.put("label",  m);
            entry.put("total",  round2(total));
            if (inc != null) entry.put("income", round2(inc));
            data.add(entry);
        }
        return Map.of("type", "monthly_totals", "data", data);
    }

    private Map<String, Object> categoryBreakdown(Long userId, Map<String, Object> params) {
        String rawMonth   = (String) params.get("month");
        String month      = rawMonth != null ? normalizeMonth(rawMonth) : null;
        String startMonth = month != null ? month : (String) params.getOrDefault("start_month", "2020-01");
        String endMonth   = month != null ? month : (String) params.getOrDefault("end_month",   "2099-12");

        List<Object[]> rows = transactionRepository.getCategorySummaryForRange(userId, startMonth, endMonth);
        List<Map<String, Object>> data = new ArrayList<>();
        double total = 0;
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (EXCL.contains(cat)) continue;
            double v = round2(((Number) row[1]).doubleValue());
            total += v;
            data.add(Map.of("name", cat, "value", v));
        }
        return Map.of("type", "category_breakdown", "total", round2(total), "data", data);
    }

    private Map<String, Object> dailyTotals(Long userId, Map<String, Object> params) {
        String raw   = (String) params.getOrDefault("month", LocalDate.now().toString().substring(0, 7));
        String month = normalizeMonth(raw);
        LocalDate startDate = LocalDate.parse(month + "-01");
        LocalDate endDate   = startDate.plusMonths(1);

        double minAmount = params.containsKey("min_amount") ? ((Number) params.get("min_amount")).doubleValue() : 0.0;
        double maxAmount = params.containsKey("max_amount") ? ((Number) params.get("max_amount")).doubleValue() : 1_000_000_000.0;
        boolean bounded  = params.containsKey("min_amount") || params.containsKey("max_amount");

        List<Object[]> rows = bounded
                ? transactionRepository.getDailySpendingInRangeBounded(userId, startDate, endDate, minAmount, maxAmount)
                : transactionRepository.getDailySpendingInRange(userId, startDate, endDate);
        List<Map<String, Object>> data = rows.stream().map(r -> {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("date",   r[0].toString());
            e.put("amount", round2(((Number) r[1]).doubleValue()));
            return e;
        }).collect(Collectors.toList());

        return Map.of("type", "daily_totals", "month", month, "data", data);
    }

    private Map<String, Object> transactionSearch(Long userId, Map<String, Object> params) {
        String keyword    = (String) params.getOrDefault("keyword", "");
        String startMonth = (String) params.getOrDefault("start_month", "");
        String endMonth   = (String) params.getOrDefault("end_month", "");
        Double minAmount  = params.containsKey("min_amount") ? ((Number) params.get("min_amount")).doubleValue() : null;
        Double maxAmount  = params.containsKey("max_amount") ? ((Number) params.get("max_amount")).doubleValue() : null;

        List<Object[]> rows = transactionRepository.searchTransactions(userId, keyword, startMonth, endMonth);

        List<Map<String, Object>> data = new ArrayList<>();
        for (Object[] row : rows) {
            double amt = round2(((Number) row[3]).doubleValue());
            if (minAmount != null && amt < minAmount) continue;
            if (maxAmount != null && amt > maxAmount) continue;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id",          row[0]);
            entry.put("date",        row[1].toString());
            entry.put("description", row[2]);
            entry.put("amount",      amt);
            entry.put("category",    row[4] != null ? (String) row[4] : "Other");
            data.add(entry);
            if (data.size() >= 50) break;
        }

        return Map.of("type", "transaction_search", "keyword", keyword, "data", data);
    }

    private Map<String, Object> calendarHeatmap(Long userId, Map<String, Object> params) {
        Object rawYear = params.get("year");
        int year = rawYear != null ? Integer.parseInt(rawYear.toString()) : LocalDate.now().getYear();

        LocalDate start = LocalDate.of(year, 1, 1);
        LocalDate end   = LocalDate.of(year + 1, 1, 1);

        List<Object[]> rows = transactionRepository.getDailySpendingInRange(userId, start, end);
        List<Map<String, Object>> data = rows.stream().map(r -> {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("date",   r[0].toString());
            e.put("amount", round2(((Number) r[1]).doubleValue()));
            return e;
        }).collect(Collectors.toList());

        return Map.of("type", "calendar_heatmap", "year", year, "data", data);
    }

    private Map<String, Object> availableMonths(Long userId) {
        List<String> months = transactionRepository.findDistinctMonthsByUserId(userId)
                .stream().sorted().collect(Collectors.toList());
        return Map.of("type", "available_months", "months", months);
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /** Accept "YYYY-MM", "MM", "M", "YYYY-M" — always return "YYYY-MM". */
    private static String normalizeMonth(String raw) {
        if (raw == null) return LocalDate.now().toString().substring(0, 7);
        raw = raw.trim();
        if (raw.matches("\\d{4}-\\d{2}")) return raw;                  // already YYYY-MM
        if (raw.matches("\\d{4}-\\d{1}")) return raw.substring(0, 5) + "0" + raw.charAt(5); // YYYY-M
        if (raw.matches("\\d{2}")) return LocalDate.now().getYear() + "-" + raw; // MM → current year
        if (raw.matches("\\d{1}")) return LocalDate.now().getYear() + "-0" + raw; // M → current year
        return raw;
    }
}
