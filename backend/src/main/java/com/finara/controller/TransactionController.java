package com.finara.controller;

import com.finara.dto.transaction.TransactionResponse;
import com.finara.service.TransactionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    /**
     * UC1b: Upload PDF bank statement.
     * POST /api/transactions/upload-pdf
     */
    @PostMapping("/upload-pdf")
    public ResponseEntity<Map<String, Object>> uploadPdf(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        Map<String, Object> result = transactionService.uploadAndProcessPdf(file, userId);
        return ResponseEntity.ok(result);
    }

    /**
     * UC1: Upload CSV file of transactions.
     * POST /api/transactions/upload
     */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadCsv(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        Map<String, Object> result = transactionService.uploadAndProcess(file, userId);
        return ResponseEntity.ok(result);
    }

    /**
     * UC2: Get spending summary (top categories) for a month.
     * GET /api/transactions/summary?month=2025-07
     */
    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getMonthlySummary(
            @RequestParam(required = false) String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        String start = startMonth != null ? startMonth : endMonth;
        return ResponseEntity.ok(transactionService.getMonthlySummary(userId, start, endMonth));
    }

    /**
     * List transactions for a date range.
     * GET /api/transactions?startMonth=YYYY-MM&endMonth=YYYY-MM
     */
    @GetMapping
    public ResponseEntity<List<TransactionResponse>> listTransactions(
            @RequestParam(required = false) String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.getTransactions(userId, startMonth, endMonth));
    }

    /**
     * UC5: Get anomalous transactions for a date range.
     * GET /api/transactions/anomalies?startMonth=YYYY-MM&endMonth=YYYY-MM
     */
    @GetMapping("/anomalies")
    public ResponseEntity<List<TransactionResponse>> getAnomalies(
            @RequestParam(required = false) String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.getAnomalies(userId, startMonth, endMonth));
    }

    /**
     * List all months that have data.
     * GET /api/transactions/months
     */
    @GetMapping("/months")
    public ResponseEntity<List<String>> getAvailableMonths(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.getAvailableMonths(userId));
    }

    /**
     * List all upload batches with metadata.
     * GET /api/transactions/batches
     */
    @GetMapping("/batches")
    public ResponseEntity<List<Map<String, Object>>> getUploadBatches(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.getUploadBatches(userId));
    }

    /**
     * Delete all transactions from a specific upload batch.
     * DELETE /api/transactions/batch/{batchId}
     */
    @DeleteMapping("/batch/{batchId}")
    public ResponseEntity<Map<String, Object>> deleteBatch(
            @PathVariable String batchId, HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        transactionService.deleteBatch(userId, batchId);
        return ResponseEntity.ok(Map.of("message", "Batch deleted successfully"));
    }

    /**
     * Delete all data for the current user (transactions, budgets, reports).
     * DELETE /api/transactions/all
     */
    @DeleteMapping("/all")
    public ResponseEntity<Map<String, Object>> deleteAll(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        transactionService.deleteAllData(userId);
        return ResponseEntity.ok(Map.of("message", "All data deleted successfully"));
    }

    /** POST /api/transactions/recheck-anomalies?startMonth=&endMonth= */
    @PostMapping("/recheck-anomalies")
    public ResponseEntity<Map<String, Object>> recheckAnomalies(
            @RequestParam(required = false) String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.recheckAnomalies(userId, startMonth, endMonth));
    }

    /** PATCH /api/transactions/{id}/anomaly  { "isAnomaly": true/false } */
    @PatchMapping("/{id}/anomaly")
    public ResponseEntity<TransactionResponse> toggleAnomaly(
            @PathVariable Long id,
            @RequestBody Map<String, Boolean> body,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        boolean flag = Boolean.TRUE.equals(body.get("isAnomaly"));
        return ResponseEntity.ok(transactionService.toggleAnomaly(userId, id, flag));
    }

    /** POST /api/transactions  { description, amount, transactionDate, transactionType, category } */
    @PostMapping
    public ResponseEntity<TransactionResponse> createTransaction(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.createTransaction(userId, body));
    }

    /** PUT /api/transactions/{id} */
    @PutMapping("/{id}")
    public ResponseEntity<TransactionResponse> updateTransaction(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(transactionService.updateTransaction(userId, id, body));
    }

    /** DELETE /api/transactions/{id} */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteTransaction(
            @PathVariable Long id,
            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute("userId");
        transactionService.deleteTransaction(userId, id);
        return ResponseEntity.ok(Map.of("message", "Transaction deleted"));
    }
}
