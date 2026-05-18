package com.finara.controller;

import com.finara.dto.budget.BudgetRequest;
import com.finara.dto.budget.MultiBudgetRequest;
import com.finara.service.ReportService;
import com.finara.service.BudgetService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ReportAndBudgetController {

    private final ReportService reportService;
    private final BudgetService budgetService;

    // ─── UC3: Compare months ─────────────────────────────────────────────────

    /** GET /api/reports?months=2025-05,2025-06,2025-07 */
    @GetMapping("/reports")
    public ResponseEntity<List<Map<String, Object>>> getReports(
            @RequestParam(required = false) String months,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getReports(userId, months));
    }

    /** GET /api/reports/compare/daily?months=2026-04,2026-05 — bulk daily spending (1 DB call) */
    @GetMapping("/reports/compare/daily")
    public ResponseEntity<Map<String, Object>> getCompareDaily(
            @RequestParam String months,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getDailySpendingBulk(userId, months));
    }

    /** GET /api/reports/compare/insights?months=2026-04,2026-05 — AI compare insights (Gemma, cached) */
    @GetMapping("/reports/compare/insights")
    public ResponseEntity<Map<String, Object>> getCompareInsights(
            @RequestParam String months,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getCompareInsights(userId, months));
    }

    /** GET /api/reports/{month} — single stored report */
    @GetMapping("/reports/{month}")
    public ResponseEntity<Map<String, Object>> getReport(
            @PathVariable String month,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getReportWithNarrative(userId, month));
    }

    // ─── UC6: Forecast ───────────────────────────────────────────────────────

    /** GET /api/forecast?month=2025-07 */
    @GetMapping("/forecast")
    public ResponseEntity<Map<String, Object>> getForecast(
            @RequestParam String month,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getForecast(userId, month));
    }

    /** GET /api/forecast/daily?month=2025-07 */
    @GetMapping("/forecast/daily")
    public ResponseEntity<Map<String, Object>> getDailyForecast(
            @RequestParam String month,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getDailyForecast(userId, month));
    }

    /** GET /api/forecast/seasonality — per-category month-of-year spending index */
    @GetMapping("/forecast/seasonality")
    public ResponseEntity<Map<String, Object>> getSeasonalityProfile(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getSeasonalityProfile(userId));
    }

    /** GET /api/forecast/multi?baseMonth=2026-05&periods=6 */
    @GetMapping("/forecast/multi")
    public ResponseEntity<Map<String, Object>> getMultiPeriodForecast(
            @RequestParam String baseMonth,
            @RequestParam(defaultValue = "6") int periods,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getMultiPeriodForecast(userId, baseMonth, periods));
    }

    /** GET /api/forecast/budget-suggest?month=2026-06 */
    @GetMapping("/forecast/budget-suggest")
    public ResponseEntity<Map<String, Object>> getBudgetSuggestions(
            @RequestParam String month,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getBudgetSuggestions(userId, month));
    }

    /** GET /api/forecast/accuracy — MAPE over last 3 evaluable months */
    @GetMapping("/forecast/accuracy")
    public ResponseEntity<Map<String, Object>> getForecastAccuracy(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getForecastAccuracy(userId));
    }

    /** POST /api/forecast/refresh?month=2026-06 — evict cache then return fresh forecast */
    @PostMapping("/forecast/refresh")
    public ResponseEntity<Map<String, Object>> refreshForecast(
            @RequestParam String month,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        reportService.evictForecastCache(userId, month);
        return ResponseEntity.ok(reportService.getForecast(userId, month));
    }

    /** GET /api/forecast/range?startDate=2026-01-15&endDate=2026-01-31 */
    @GetMapping("/forecast/range")
    public ResponseEntity<Map<String, Object>> getForecastRange(
            @RequestParam String startDate,
            @RequestParam String endDate,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getForecastRange(userId, startDate, endDate));
    }

    // ─── UC7: Budget vs Actual ────────────────────────────────────────────────

    /** GET /api/budget?month=2025-07&includeAnalysis=false */
    @GetMapping("/budget")
    public ResponseEntity<Map<String, Object>> getBudget(
            @RequestParam String month,
            @RequestParam(defaultValue = "true") boolean includeAnalysis,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.getBudgetVsActual(userId, month, includeAnalysis));
    }

    /** GET /api/budget/context?month=2026-06 — last 3 months actuals per category */
    @GetMapping("/budget/context")
    public ResponseEntity<Map<String, Object>> getBudgetContext(
            @RequestParam String month,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.getSpendingContext(userId, month));
    }

    /** GET /api/budget/analysis?month=2026-05 — AI analysis only (slow, cached) */
    @GetMapping("/budget/analysis")
    public ResponseEntity<Map<String, Object>> getBudgetAnalysis(
            @RequestParam String month,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.getBudgetAnalysis(userId, month));
    }

    /** GET /api/budget/history?months=2026-01,... (months optional) */
    @GetMapping("/budget/history")
    public ResponseEntity<List<Map<String, Object>>> getBudgetHistory(
            @RequestParam(required = false) String months,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.getBudgetHistory(userId, months));
    }

    /** POST /api/budget — set budgets for a month */
    @PostMapping("/budget")
    public ResponseEntity<Map<String, Object>> setBudget(
            @Valid @RequestBody BudgetRequest req,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.saveBudget(userId, req));
    }

    /** GET /api/budget/multi?baseMonth=2026-05&periods=6 — combined forecast + budgets + actuals */
    @GetMapping("/budget/multi")
    public ResponseEntity<Map<String, Object>> getMultiMonthPlan(
            @RequestParam String baseMonth,
            @RequestParam(defaultValue = "6") int periods,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.getMultiMonthPlan(userId, baseMonth, periods));
    }

    /** POST /api/budget/multi — save budgets for multiple months at once */
    @PostMapping("/budget/multi")
    public ResponseEntity<Map<String, Object>> saveMultiMonthBudgets(
            @Valid @RequestBody MultiBudgetRequest req,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.saveMultiMonthBudgets(userId, req));
    }
}
