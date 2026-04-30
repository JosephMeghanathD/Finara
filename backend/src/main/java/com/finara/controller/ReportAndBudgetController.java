package com.finara.controller;

import com.finara.dto.budget.BudgetRequest;
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

    /** GET /api/reports/{month} — single stored report */
    @GetMapping("/reports/{month}")
    public ResponseEntity<Map<String, Object>> getReport(
            @PathVariable String month,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(reportService.getReport(userId, month));
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

    /** POST /api/budget — set budgets for a month */
    @PostMapping("/budget")
    public ResponseEntity<Map<String, Object>> setBudget(
            @Valid @RequestBody BudgetRequest req,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(budgetService.saveBudget(userId, req));
    }
}
