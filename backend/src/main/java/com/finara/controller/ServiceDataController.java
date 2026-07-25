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
                case "merchant_breakdown"  -> ResponseEntity.ok(merchantBreakdown(userId, params));
                case "category_month_matrix" -> ResponseEntity.ok(categoryMonthMatrix(userId, params));
                case "money_flow"          -> ResponseEntity.ok(moneyFlow(userId, params));
                case "transaction_points"  -> ResponseEntity.ok(transactionPoints(userId, params));
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
        if (months.isEmpty()) return Map.of("type", "monthly_totals", "data", List.of());

        // Filtered path: one grouped query with predicates (no income series — a
        // category/merchant/amount slice of income doesn't make sense).
        if (hasFilters(params)) {
            List<Object[]> rows = transactionRepository.getMonthlyTotalsFiltered(
                    userId, months.get(0), months.get(months.size() - 1),
                    strParam(params, "category"), merchantParam(params),
                    strParam(params, "exclude_merchant"), strParam(params, "exclude_category"),
                    minAmt(params), maxAmt(params));
            List<Map<String, Object>> data = new ArrayList<>();
            for (Object[] r : rows) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("month", r[0]);
                e.put("label", r[0]);
                e.put("total", round2(((Number) r[1]).doubleValue()));
                data.add(e);
            }
            return Map.of("type", "monthly_totals", "data", data);
        }

        // Unfiltered path: per-month totals plus the income series (for line charts).
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
        String[] range = rangeFromParams(userId, params);
        String startMonth = range[0], endMonth = range[1];

        List<Object[]> rows = hasFilters(params)
                ? transactionRepository.getCategorySummaryForRangeFiltered(
                        userId, startMonth, endMonth, merchantParam(params),
                        strParam(params, "exclude_merchant"), strParam(params, "exclude_category"),
                        minAmt(params), maxAmt(params))
                : transactionRepository.getCategorySummaryForRange(userId, startMonth, endMonth);

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

    private Map<String, Object> merchantBreakdown(Long userId, Map<String, Object> params) {
        String[] range = rangeFromParams(userId, params);
        List<Object[]> rows = transactionRepository.getMerchantBreakdownFiltered(
                userId, range[0], range[1], strParam(params, "category"),
                strParam(params, "exclude_merchant"), strParam(params, "exclude_category"),
                minAmt(params), maxAmt(params));

        List<Map<String, Object>> data = new ArrayList<>();
        double total = 0;
        for (Object[] row : rows) {
            String name = row[0] != null ? (String) row[0] : "Unknown";
            double v = round2(((Number) row[1]).doubleValue());
            total += v;
            data.add(Map.of("name", name, "value", v));
        }
        return Map.of("type", "merchant_breakdown", "total", round2(total), "data", data);
    }

    /** Category × month grid — feeds stacked bar/area and matrix heatmap. Top 8 categories, rest → "Other". */
    private Map<String, Object> categoryMonthMatrix(Long userId, Map<String, Object> params) {
        String[] range = rangeFromParams(userId, params);
        List<Object[]> rows = transactionRepository.getCategoryMonthMatrix(
                userId, range[0], range[1],
                strParam(params, "exclude_merchant"), strParam(params, "exclude_category"),
                minAmt(params), maxAmt(params));

        Map<String, Double> catTotals = new HashMap<>();
        Map<String, Map<String, Double>> byMonth = new LinkedHashMap<>();
        Set<String> monthSet = new TreeSet<>();
        for (Object[] r : rows) {
            String ym  = (String) r[0];
            String cat = r[1] != null ? (String) r[1] : "Other";
            double v   = round2(((Number) r[2]).doubleValue());
            monthSet.add(ym);
            catTotals.merge(cat, v, Double::sum);
            byMonth.computeIfAbsent(ym, k -> new HashMap<>()).merge(cat, v, Double::sum);
        }

        List<String> ranked = catTotals.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey).collect(Collectors.toList());
        List<String> top = ranked.size() > 8 ? new ArrayList<>(ranked.subList(0, 8)) : new ArrayList<>(ranked);
        boolean hasOther = ranked.size() > 8;
        Set<String> topSet = new HashSet<>(top);

        List<String> months = new ArrayList<>(monthSet);
        List<Map<String, Object>> data = new ArrayList<>();
        for (String m : months) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", m);
            Map<String, Double> cm = byMonth.getOrDefault(m, Map.of());
            double other = 0;
            for (Map.Entry<String, Double> e : cm.entrySet()) {
                if (topSet.contains(e.getKey())) row.put(e.getKey(), round2(e.getValue()));
                else other += e.getValue();
            }
            for (String c : top) row.putIfAbsent(c, 0.0);
            if (hasOther) row.put("Other", round2(other));
            data.add(row);
        }
        List<String> categories = new ArrayList<>(top);
        if (hasOther) categories.add("Other");
        return Map.of("type", "category_month_matrix", "months", months, "categories", categories, "data", data);
    }

    /** Money flow: Income → top categories → top merchants. Returns Sankey nodes + links. */
    private Map<String, Object> moneyFlow(Long userId, Map<String, Object> params) {
        String[] range = rangeFromParams(userId, params);
        Double income = transactionRepository.getCreditTotalForRange(userId, range[0], range[1]);
        double incomeTotal = income != null ? round2(income) : 0.0;

        List<Object[]> catRows = transactionRepository.getCategorySummaryForRange(userId, range[0], range[1]);
        List<Map<String, Object>> cats = new ArrayList<>();
        for (Object[] r : catRows) {
            String c = r[0] != null ? (String) r[0] : "Other";
            if (EXCL.contains(c)) continue;
            cats.add(Map.of("name", c, "value", round2(((Number) r[1]).doubleValue())));
        }
        cats.sort((a, b) -> Double.compare((double) b.get("value"), (double) a.get("value")));
        if (cats.size() > 8) cats = new ArrayList<>(cats.subList(0, 8));

        // Nodes: Income(0), then categories, then top merchants per top category.
        List<String> nodes = new ArrayList<>();
        Map<String, Integer> idx = new LinkedHashMap<>();
        java.util.function.Function<String, Integer> node = name -> {
            if (!idx.containsKey(name)) { idx.put(name, nodes.size()); nodes.add(name); }
            return idx.get(name);
        };
        node.apply("Income");
        List<Map<String, Object>> links = new ArrayList<>();
        int topCatsForMerchants = Math.min(4, cats.size());
        for (int i = 0; i < cats.size(); i++) {
            String cat = (String) cats.get(i).get("name");
            double val = (double) cats.get(i).get("value");
            links.add(Map.of("source", node.apply("Income"), "target", node.apply(cat), "value", val));
            if (i < topCatsForMerchants) {
                List<Object[]> mRows = transactionRepository.getMerchantBreakdownFiltered(
                        userId, range[0], range[1], cat, "", "", 0.0, 1_000_000_000.0);
                int shown = 0;
                for (Object[] mr : mRows) {
                    if (shown >= 3) break;
                    String mName = mr[0] != null ? (String) mr[0] : "Other";
                    double mVal = round2(((Number) mr[1]).doubleValue());
                    if (mVal <= 0) continue;
                    links.add(Map.of("source", node.apply(cat), "target", node.apply(mName + " "), "value", mVal));
                    shown++;
                }
            }
        }
        List<Map<String, Object>> nodeObjs = nodes.stream()
                .map(n -> Map.<String, Object>of("name", n.trim())).collect(Collectors.toList());
        return Map.of("type", "money_flow", "income", incomeTotal, "nodes", nodeObjs, "links", links);
    }

    /** Individual transactions (date, amount, anomaly flag) for a scatter plot. */
    private Map<String, Object> transactionPoints(Long userId, Map<String, Object> params) {
        String[] range = rangeFromParams(userId, params);
        List<Object[]> rows = transactionRepository.getTransactionPoints(
                userId, range[0], range[1],
                strParam(params, "exclude_merchant"), minAmt(params), maxAmt(params));
        List<Map<String, Object>> data = new ArrayList<>();
        for (Object[] r : rows) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("date",     r[0].toString());
            e.put("amount",   round2(((Number) r[1]).doubleValue()));
            e.put("anomaly",  Boolean.TRUE.equals(r[2]));
            e.put("category", r[3] != null ? (String) r[3] : "Other");
            e.put("description", r[4]);
            data.add(e);
            if (data.size() >= 500) break;
        }
        return Map.of("type", "transaction_points", "data", data);
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

    // ── Filter helpers for the chat query planner ───────────────────────────────

    private static String strParam(Map<String, Object> p, String key) {
        Object v = p.get(key);
        return v == null ? "" : v.toString().trim();
    }

    /** Merchant filter may arrive as "merchant" or "keyword". */
    private static String merchantParam(Map<String, Object> p) {
        String m = strParam(p, "merchant");
        return !m.isEmpty() ? m : strParam(p, "keyword");
    }

    private static double minAmt(Map<String, Object> p) {
        return p.containsKey("min_amount") ? ((Number) p.get("min_amount")).doubleValue() : 0.0;
    }

    private static double maxAmt(Map<String, Object> p) {
        return p.containsKey("max_amount") ? ((Number) p.get("max_amount")).doubleValue() : 1_000_000_000.0;
    }

    private static boolean hasFilters(Map<String, Object> p) {
        return !strParam(p, "category").isEmpty()
                || !merchantParam(p).isEmpty()
                || !strParam(p, "exclude_merchant").isEmpty()
                || !strParam(p, "exclude_category").isEmpty()
                || p.containsKey("min_amount")
                || p.containsKey("max_amount");
    }

    /** Resolve a [startMonth, endMonth] range from month / start_month+end_month / count / all-time. */
    private String[] rangeFromParams(Long userId, Map<String, Object> params) {
        String rawMonth = (String) params.get("month");
        if (rawMonth != null) {
            String m = normalizeMonth(rawMonth);
            return new String[]{m, m};
        }
        String sm = (String) params.get("start_month");
        String em = (String) params.get("end_month");
        if (sm != null && em != null) return new String[]{sm, em};
        if (params.containsKey("count")) {
            int count = ((Number) params.get("count")).intValue();
            List<String> months = transactionRepository.findDistinctMonthsByUserId(userId)
                    .stream().limit(count).sorted().collect(Collectors.toList());
            if (!months.isEmpty()) return new String[]{months.get(0), months.get(months.size() - 1)};
        }
        return new String[]{"2020-01", "2099-12"};
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
