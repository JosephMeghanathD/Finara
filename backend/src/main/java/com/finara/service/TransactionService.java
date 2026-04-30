package com.finara.service;

import com.finara.dto.transaction.TransactionResponse;
import com.finara.model.Transaction;
import com.finara.model.User;
import com.finara.repository.BudgetRepository;
import com.finara.repository.FinancialReportRepository;
import com.finara.repository.TransactionRepository;
import com.finara.repository.UserRepository;
import com.opencsv.CSVReader;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.finara.config.TimingContext;
import jakarta.transaction.Transactional;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final BudgetRepository budgetRepository;
    private final FinancialReportRepository financialReportRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy")
    );

    // ─── UC1b: Upload PDF Bank Statement ─────────────────────────────────────

    @Caching(evict = {
        @CacheEvict(value = "months",               key = "#userId"),
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
        @CacheEvict(value = "budgets",              allEntries = true),
    })
    @SuppressWarnings("unchecked")
    public Map<String, Object> uploadAndProcessPdf(MultipartFile file, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!file.getOriginalFilename().toLowerCase().endsWith(".pdf")) {
            throw new RuntimeException("File must be a PDF");
        }

        // Send PDF to ML service for parsing
        String batchId = UUID.randomUUID().toString();
        List<Transaction> parsed;

        try {
            org.springframework.core.io.ByteArrayResource resource =
                new org.springframework.core.io.ByteArrayResource(file.getBytes()) {
                    @Override public String getFilename() { return file.getOriginalFilename(); }
                };

            org.springframework.util.LinkedMultiValueMap<String, Object> body =
                new org.springframework.util.LinkedMultiValueMap<>();
            body.add("file", resource);

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

            org.springframework.http.HttpEntity<org.springframework.util.MultiValueMap<String, Object>> requestEntity =
                new org.springframework.http.HttpEntity<>(body, headers);

            Map pdfResult = mlRestTemplate.postForObject("/api/ml/parse-pdf", requestEntity, Map.class);

            if (pdfResult == null || !pdfResult.containsKey("transactions")) {
                throw new RuntimeException("PDF parser returned no data");
            }

            List<Map<String, Object>> rawTxns = (List<Map<String, Object>>) pdfResult.get("transactions");
            parsed = rawTxns.stream().map(t -> {
                String dateStr = (String) t.get("date");
                String desc    = (String) t.get("description");
                Number amt     = (Number) t.get("amount");

                LocalDate date;
                try {
                    date = LocalDate.parse(dateStr);
                } catch (Exception e) {
                    date = LocalDate.now();
                }

                double amtDouble = amt != null ? amt.doubleValue() : 0.0;
                // Use explicit type from PDF parser; fall back to inferring from sign
                String mlType = t.get("type") instanceof String ? (String) t.get("type") : null;
                String txnType = mlType != null ? mlType
                        : (amtDouble < 0 ? "DEBIT" : "CREDIT");

                return Transaction.builder()
                        .user(user)
                        .description(desc != null ? desc : "Unknown")
                        .amount(BigDecimal.valueOf(Math.abs(amtDouble)))
                        .transactionType(txnType)
                        .transactionDate(date)
                        .uploadBatchId(batchId)
                        .rawCsvRow(t.toString())
                        .isAnomaly(false)
                        .build();
            }).collect(Collectors.toList());

        } catch (Exception e) {
            throw new RuntimeException("Failed to parse PDF: " + e.getMessage());
        }

        if (parsed.isEmpty()) {
            throw new RuntimeException("No transactions found in PDF");
        }

        // Run same ML pipeline as CSV
        List<Transaction> categorized   = categorize(parsed);
        List<Transaction> withAnomalies = detectAnomalies(categorized);
        long dbStart = System.currentTimeMillis();
        transactionRepository.saveAll(withAnomalies);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        long flagged = withAnomalies.stream().filter(t -> Boolean.TRUE.equals(t.getIsAnomaly())).count();

        return Map.of(
                "batchId", batchId,
                "total",   withAnomalies.size(),
                "flagged", flagged,
                "source",  "pdf",
                "message", "Successfully parsed and processed " + withAnomalies.size() + " transactions from PDF"
        );
    }

    // ─── UC1: Upload CSV ─────────────────────────────────────────────────────

    @Caching(evict = {
        @CacheEvict(value = "months",               key = "#userId"),
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
        @CacheEvict(value = "budgets",              allEntries = true),
    })
    public Map<String, Object> uploadAndProcess(MultipartFile file, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String batchId = UUID.randomUUID().toString();
        List<Transaction> parsed = parseCsv(file, user, batchId);

        if (parsed.isEmpty()) {
            throw new RuntimeException("No valid transactions found in CSV");
        }

        // Step 1: Categorize via ML service
        List<Transaction> categorized = categorize(parsed);

        // Step 2: Detect anomalies via ML service
        List<Transaction> withAnomalies = detectAnomalies(categorized);

        // Step 3: Save all
        long dbStart = System.currentTimeMillis();
        transactionRepository.saveAll(withAnomalies);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        long flagged = withAnomalies.stream().filter(t -> Boolean.TRUE.equals(t.getIsAnomaly())).count();

        return Map.of(
                "batchId",    batchId,
                "total",      withAnomalies.size(),
                "flagged",    flagged,
                "message",    "Successfully processed " + withAnomalies.size() + " transactions"
        );
    }

    // ─── CSV Parsing ──────────────────────────────────────────────────────────

    private List<Transaction> parseCsv(MultipartFile file, User user, String batchId) {
        List<Transaction> result = new ArrayList<>();
        try (CSVReader reader = new CSVReader(new InputStreamReader(file.getInputStream()))) {
            String[] headers = reader.readNext();
            if (headers == null) return result;

            int descIdx   = findColumn(headers, "description", "merchant", "name", "details", "narration");
            int dateIdx   = findColumn(headers, "date", "transaction date", "trans date", "posting date");

            // Try separate debit / credit columns first (e.g. Bank of America format)
            int debitColIdx  = findColumnOptional(headers, "debit", "withdrawal", "withdrawals", "debit amount");
            int creditColIdx = findColumnOptional(headers, "credit", "deposit", "deposits", "credit amount");
            boolean hasSeparateCols = debitColIdx >= 0 && creditColIdx >= 0 && debitColIdx != creditColIdx;

            // Fall back to a single amount column
            int amountIdx = hasSeparateCols ? -1 : findColumn(headers, "amount", "transaction amount", "debit", "credit");

            String[] row;
            while ((row = reader.readNext()) != null) {
                try {
                    BigDecimal amount;
                    String     type;

                    if (hasSeparateCols) {
                        String debitVal  = safeCell(row, debitColIdx);
                        String creditVal = safeCell(row, creditColIdx);
                        if (!debitVal.isEmpty()) {
                            amount = new BigDecimal(debitVal).abs();
                            type   = "DEBIT";
                        } else if (!creditVal.isEmpty()) {
                            amount = new BigDecimal(creditVal).abs();
                            type   = "CREDIT";
                        } else {
                            continue;
                        }
                    } else {
                        String rawAmt = safeCell(row, amountIdx);
                        if (rawAmt.isEmpty()) continue;
                        BigDecimal raw = new BigDecimal(rawAmt);
                        amount = raw.abs();
                        // Negative amounts = money out (debit) for most US bank exports.
                        // Positive amounts in a mixed-sign file = money in (credit).
                        // All-positive files (no negatives in the batch) → default DEBIT.
                        type = raw.compareTo(BigDecimal.ZERO) < 0 ? "DEBIT" : "CREDIT";
                    }

                    if (amount.compareTo(BigDecimal.ZERO) == 0) continue;

                    int maxIdx = Math.max(descIdx, dateIdx);
                    if (row.length <= maxIdx) continue;
                    String desc    = row[descIdx].trim();
                    String rawDate = row[dateIdx].trim();
                    if (desc.isBlank()) continue;

                    result.add(Transaction.builder()
                            .user(user)
                            .description(desc)
                            .amount(amount)
                            .transactionType(type)
                            .transactionDate(parseDate(rawDate))
                            .uploadBatchId(batchId)
                            .rawCsvRow(String.join(",", row))
                            .isAnomaly(false)
                            .build());
                } catch (Exception e) {
                    log.warn("Skipping malformed CSV row: {}", Arrays.toString(row));
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse CSV: " + e.getMessage());
        }

        // If every transaction ended up as CREDIT (all-positive single-amount CSV),
        // flip them all to DEBIT — a file with no credits at all is almost certainly spending data.
        long creditCount = result.stream().filter(t -> "CREDIT".equals(t.getTransactionType())).count();
        if (creditCount == result.size() && !result.isEmpty()) {
            result.forEach(t -> t.setTransactionType("DEBIT"));
        }

        return result;
    }

    private String safeCell(String[] row, int idx) {
        if (idx < 0 || idx >= row.length) return "";
        return row[idx].trim().replaceAll("[,$\\s]", "");
    }

    private int findColumn(String[] headers, String... candidates) {
        for (int i = 0; i < headers.length; i++) {
            String h = headers[i].toLowerCase().trim();
            for (String c : candidates) {
                if (h.contains(c)) return i;
            }
        }
        return 0;
    }

    // Returns -1 if no match (unlike findColumn which falls back to 0)
    private int findColumnOptional(String[] headers, String... candidates) {
        for (int i = 0; i < headers.length; i++) {
            String h = headers[i].toLowerCase().trim();
            for (String c : candidates) {
                if (h.contains(c)) return i;
            }
        }
        return -1;
    }

    private LocalDate parseDate(String raw) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try { return LocalDate.parse(raw, fmt); } catch (Exception ignored) {}
        }
        return LocalDate.now();
    }

    // ─── ML: Categorize ──────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Transaction> categorize(List<Transaction> transactions) {
        try {
            List<Map<String, Object>> payload = transactions.stream()
                    .map(t -> Map.<String, Object>of(
                            "id",          t.hashCode(),
                            "description", t.getDescription(),
                            "amount",      t.getAmount().doubleValue()))
                    .collect(Collectors.toList());

            Map<String, Object> body = Map.of("transactions", payload);
            long mlStart = System.currentTimeMillis();
            Map<String, Object> resp = mlRestTemplate.postForObject(
                    "/api/ml/categorize", body, Map.class);
            TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

            if (resp == null) return transactions;

            List<Map<String, Object>> results = (List<Map<String, Object>>) resp.get("results");
            for (int i = 0; i < transactions.size() && i < results.size(); i++) {
                Map<String, Object> r = results.get(i);
                transactions.get(i).setCategory((String) r.get("category"));
                Number conf = (Number) r.get("confidence");
                if (conf != null)
                    transactions.get(i).setCategoryConfidence(BigDecimal.valueOf(conf.doubleValue()));
            }
        } catch (Exception e) {
            log.error("Categorization failed, using default category: {}", e.getMessage());
            transactions.forEach(t -> t.setCategory("Uncategorized"));
        }
        return transactions;
    }

    // ─── ML: Anomaly Detection ───────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Transaction> detectAnomalies(List<Transaction> transactions) {
        // Credits are never anomalies — mark them safe upfront
        transactions.stream()
                .filter(t -> "CREDIT".equals(t.getTransactionType()))
                .forEach(t -> { t.setIsAnomaly(false); t.setAnomalyScore(null); t.setAnomalyReason(null); });

        List<Transaction> debits = transactions.stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .collect(Collectors.toList());

        if (debits.isEmpty()) return transactions;

        try {
            List<Map<String, Object>> payload = debits.stream()
                    .map(t -> Map.<String, Object>of(
                            "id",          t.hashCode(),
                            "description", t.getDescription(),
                            "amount",      t.getAmount().doubleValue(),
                            "date",        t.getTransactionDate().toString(),
                            "category",    t.getCategory() != null ? t.getCategory() : ""))
                    .collect(Collectors.toList());

            Map<String, Object> body = Map.of("transactions", payload);
            long mlStart = System.currentTimeMillis();
            Map<String, Object> resp = mlRestTemplate.postForObject(
                    "/api/ml/anomaly", body, Map.class);
            TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

            if (resp == null) return transactions;

            List<Map<String, Object>> results = (List<Map<String, Object>>) resp.get("results");
            for (int i = 0; i < debits.size() && i < results.size(); i++) {
                Map<String, Object> r = results.get(i);
                debits.get(i).setIsAnomaly(Boolean.TRUE.equals(r.get("is_anomaly")));
                Number score = (Number) r.get("anomaly_score");
                if (score != null)
                    debits.get(i).setAnomalyScore(BigDecimal.valueOf(score.doubleValue()));
                debits.get(i).setAnomalyReason((String) r.get("anomaly_reason"));
            }
        } catch (Exception e) {
            log.error("Anomaly detection failed: {}", e.getMessage());
        }
        return transactions;
    }

    // ─── UC2: Monthly Summary ─────────────────────────────────────────────────

    @Cacheable(value = "summaries", key = "#userId + '_' + #startMonth + '_' + (#endMonth != null ? #endMonth : #startMonth)")
    public Map<String, Object> getMonthlySummary(Long userId, String startMonth, String endMonth) {
        String end = endMonth != null ? endMonth : startMonth;

        long dbStart = System.currentTimeMillis();
        List<Object[]> rows = transactionRepository.getCategorySummaryForRange(userId, startMonth, end);
        Map<String, Double> categories = new LinkedHashMap<>();
        double total = 0;
        for (Object[] row : rows) {
            String cat = (String) row[0];
            double amt = ((Number) row[1]).doubleValue();
            categories.put(cat != null ? cat : "Uncategorized", amt);
            total += amt;
        }

        List<Transaction> anomalies = transactionRepository
                .findByUserIdAndIsAnomalyTrueOrderByTransactionDateDesc(userId)
                .stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> {
                    String ym = t.getTransactionDate().toString().substring(0, 7);
                    return ym.compareTo(startMonth) >= 0 && ym.compareTo(end) <= 0;
                })
                .collect(Collectors.toList());

        Double creditTotal = transactionRepository.getCreditTotalForRange(userId, startMonth, end);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        return Map.of(
                "startMonth",   startMonth,
                "endMonth",     end,
                "total",        total,
                "creditTotal",  creditTotal != null ? creditTotal : 0.0,
                "categories",   categories,
                "anomalyCount", anomalies.size()
        );
    }

    // ─── UC5: Anomalies ───────────────────────────────────────────────────────

    public List<TransactionResponse> getAnomalies(Long userId, String startMonth, String endMonth) {
        return transactionRepository
                .findByUserIdAndIsAnomalyTrueOrderByTransactionDateDesc(userId)
                .stream()
                .filter(t -> !"CREDIT".equals(t.getTransactionType()))
                .filter(t -> {
                    if (startMonth == null) return true;
                    String ym = t.getTransactionDate().toString().substring(0, 7);
                    return ym.compareTo(startMonth) >= 0 && ym.compareTo(endMonth != null ? endMonth : startMonth) <= 0;
                })
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Caching(evict = {
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
    })
    public Map<String, Object> recheckAnomalies(Long userId, String startMonth, String endMonth) {
        long dbStart = System.currentTimeMillis();
        List<Transaction> txns;
        if (startMonth != null && endMonth != null) {
            txns = transactionRepository.findByUserIdAndMonthRange(userId, startMonth, endMonth);
        } else if (startMonth != null) {
            txns = transactionRepository.findByUserIdAndMonth(userId, startMonth);
        } else {
            txns = transactionRepository.findByUserIdOrderByTransactionDateDesc(userId);
        }
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);
        if (txns.isEmpty()) return Map.of("checked", 0, "flagged", 0);

        List<Transaction> rechecked = detectAnomalies(txns);
        dbStart = System.currentTimeMillis();
        transactionRepository.saveAll(rechecked);
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        long flagged = rechecked.stream().filter(t -> Boolean.TRUE.equals(t.getIsAnomaly())).count();
        return Map.of("checked", rechecked.size(), "flagged", flagged);
    }

    public List<TransactionResponse> getTransactions(Long userId, String startMonth, String endMonth) {
        List<Transaction> txns;
        if (startMonth != null && endMonth != null) {
            txns = transactionRepository.findByUserIdAndMonthRange(userId, startMonth, endMonth);
        } else if (startMonth != null) {
            txns = transactionRepository.findByUserIdAndMonth(userId, startMonth);
        } else {
            txns = transactionRepository.findByUserIdOrderByTransactionDateDesc(userId);
        }
        return txns.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Cacheable(value = "months", key = "#userId")
    public List<String> getAvailableMonths(Long userId) {
        return transactionRepository.findDistinctMonthsByUserId(userId)
                .stream()
                .sorted(Comparator.reverseOrder())
                .collect(Collectors.toList());
    }

    // ─── Anomaly Toggle ───────────────────────────────────────────────────────

    @Caching(evict = {
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
    })
    public TransactionResponse toggleAnomaly(Long userId, Long txnId, boolean isAnomaly) {
        Transaction txn = transactionRepository.findById(txnId)
                .orElseThrow(() -> new RuntimeException("Transaction not found"));
        if (!txn.getUser().getId().equals(userId))
            throw new RuntimeException("Access denied");
        txn.setIsAnomaly(isAnomaly);
        if (!isAnomaly) { txn.setAnomalyScore(null); txn.setAnomalyReason(null); }
        return toResponse(transactionRepository.save(txn));
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    @Caching(evict = {
        @CacheEvict(value = "months",    key = "#userId"),
        @CacheEvict(value = "summaries", allEntries = true),
        @CacheEvict(value = "reports",   allEntries = true),
        @CacheEvict(value = "forecasts", allEntries = true),
        @CacheEvict(value = "stories",   allEntries = true),
        @CacheEvict(value = "coach",     allEntries = true),
    })
    public TransactionResponse createTransaction(Long userId, Map<String, Object> body) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Transaction txn = Transaction.builder()
                .user(user)
                .description(String.valueOf(body.get("description")))
                .amount(new BigDecimal(body.get("amount").toString()))
                .transactionType(body.getOrDefault("transactionType", "DEBIT").toString())
                .transactionDate(LocalDate.parse(body.get("transactionDate").toString()))
                .category(body.containsKey("category") ? body.get("category").toString() : null)
                .isAnomaly(false)
                .uploadBatchId("manual")
                .rawCsvRow("manual entry")
                .build();
        return toResponse(transactionRepository.save(txn));
    }

    @Caching(evict = {
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
    })
    public TransactionResponse updateTransaction(Long userId, Long txnId, Map<String, Object> body) {
        Transaction txn = transactionRepository.findById(txnId)
                .orElseThrow(() -> new RuntimeException("Transaction not found"));
        if (!txn.getUser().getId().equals(userId))
            throw new RuntimeException("Access denied");
        if (body.containsKey("description"))     txn.setDescription(body.get("description").toString());
        if (body.containsKey("amount"))          txn.setAmount(new BigDecimal(body.get("amount").toString()));
        if (body.containsKey("transactionType")) txn.setTransactionType(body.get("transactionType").toString());
        if (body.containsKey("transactionDate")) txn.setTransactionDate(LocalDate.parse(body.get("transactionDate").toString()));
        if (body.containsKey("category"))        txn.setCategory(body.get("category").toString());
        return toResponse(transactionRepository.save(txn));
    }

    @Caching(evict = {
        @CacheEvict(value = "months",               key = "#userId"),
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
    })
    public void deleteTransaction(Long userId, Long txnId) {
        Transaction txn = transactionRepository.findById(txnId)
                .orElseThrow(() -> new RuntimeException("Transaction not found"));
        if (!txn.getUser().getId().equals(userId))
            throw new RuntimeException("Access denied");
        transactionRepository.deleteById(txnId);
    }

    // ─── Batch Management ─────────────────────────────────────────────────────

    public List<Map<String, Object>> getUploadBatches(Long userId) {
        List<Object[]> rows = transactionRepository.findBatchSummaryByUserId(userId);
        return rows.stream().map(row -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("batchId",          row[0]);
            m.put("transactionCount", ((Number) row[1]).intValue());
            m.put("earliestDate",     row[2].toString());
            m.put("latestDate",       row[3].toString());
            m.put("totalAmount",      ((Number) row[4]).doubleValue());
            m.put("uploadedAt",       row[5].toString());
            m.put("creditTotal",      row[6] != null ? ((Number) row[6]).doubleValue() : 0.0);
            m.put("debitTotal",       row[7] != null ? ((Number) row[7]).doubleValue() : 0.0);
            return m;
        }).collect(Collectors.toList());
    }

    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "months",               key = "#userId"),
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
        @CacheEvict(value = "budgets",              allEntries = true),
    })
    public void deleteBatch(Long userId, String batchId) {
        transactionRepository.deleteByBatchIdAndUserId(batchId, userId);
    }

    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "months",               key = "#userId"),
        @CacheEvict(value = "summaries",            allEntries = true),
        @CacheEvict(value = "reports",              allEntries = true),
        @CacheEvict(value = "forecasts",            allEntries = true),
        @CacheEvict(value = "stories",              allEntries = true),
        @CacheEvict(value = "anomaly-explanations", allEntries = true),
        @CacheEvict(value = "coach",                allEntries = true),
        @CacheEvict(value = "budgets",              allEntries = true),
    })
    public void deleteAllData(Long userId) {
        transactionRepository.deleteAllByUserId(userId);
        budgetRepository.deleteByUserId(userId);
        financialReportRepository.deleteByUserId(userId);
    }

    private TransactionResponse toResponse(Transaction t) {
        return TransactionResponse.builder()
                .id(t.getId())
                .description(t.getDescription())
                .amount(t.getAmount())
                .transactionType(t.getTransactionType() != null ? t.getTransactionType() : "DEBIT")
                .transactionDate(t.getTransactionDate())
                .category(t.getCategory())
                .categoryConfidence(t.getCategoryConfidence())
                .isAnomaly(t.getIsAnomaly())
                .anomalyScore(t.getAnomalyScore())
                .anomalyReason(t.getAnomalyReason())
                .uploadBatchId(t.getUploadBatchId())
                .build();
    }
}
