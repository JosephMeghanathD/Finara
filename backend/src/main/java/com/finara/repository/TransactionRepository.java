package com.finara.repository;

import com.finara.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    List<Transaction> findByUserIdOrderByTransactionDateDesc(Long userId);

    List<Transaction> findByUserIdAndTransactionDateBetweenOrderByTransactionDateDesc(
            Long userId, LocalDate start, LocalDate end);

    List<Transaction> findByUserIdAndIsAnomalyTrueOrderByTransactionDateDesc(Long userId);

    @Query(value = "SELECT * FROM transactions WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') = :yearMonth " +
                   "ORDER BY transaction_date DESC",
           nativeQuery = true)
    List<Transaction> findByUserIdAndMonth(@Param("userId") Long userId,
                                           @Param("yearMonth") String yearMonth);

    @Query(value = "SELECT * FROM transactions WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth " +
                   "ORDER BY transaction_date DESC",
           nativeQuery = true)
    List<Transaction> findByUserIdAndMonthRange(@Param("userId") Long userId,
                                                @Param("startMonth") String startMonth,
                                                @Param("endMonth") String endMonth);

    @Query(value = "SELECT category, SUM(amount) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') = :yearMonth " +
                   "AND (transaction_type IS NULL OR transaction_type = 'DEBIT') " +
                   "GROUP BY category ORDER BY SUM(amount) DESC",
           nativeQuery = true)
    List<Object[]> getCategorySummaryForMonth(@Param("userId") Long userId,
                                               @Param("yearMonth") String yearMonth);

    @Query(value = "SELECT category, SUM(amount) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth " +
                   "AND (transaction_type IS NULL OR transaction_type = 'DEBIT') " +
                   "GROUP BY category ORDER BY SUM(amount) DESC",
           nativeQuery = true)
    List<Object[]> getCategorySummaryForRange(@Param("userId") Long userId,
                                               @Param("startMonth") String startMonth,
                                               @Param("endMonth") String endMonth);

    // Excludes anomalous transactions — used for savings planning so one-off events
    // (ER visits, big trips, appliance failures) don't distort the typical monthly picture.
    @Query(value = "SELECT category, SUM(amount) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth " +
                   "AND (transaction_type IS NULL OR transaction_type = 'DEBIT') " +
                   "AND (is_anomaly IS NULL OR is_anomaly = FALSE) " +
                   "GROUP BY category ORDER BY SUM(amount) DESC",
           nativeQuery = true)
    List<Object[]> getCategorySummaryForRangeNormal(@Param("userId") Long userId,
                                                     @Param("startMonth") String startMonth,
                                                     @Param("endMonth") String endMonth);

    @Query(value = "SELECT DISTINCT TO_CHAR(transaction_date, 'YYYY-MM') " +
                   "FROM transactions WHERE user_id = :userId ORDER BY 1 DESC",
           nativeQuery = true)
    List<String> findDistinctMonthsByUserId(@Param("userId") Long userId);

    @Query(value = "SELECT COALESCE(SUM(amount), 0) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth " +
                   "AND transaction_type = 'CREDIT'",
           nativeQuery = true)
    Double getCreditTotalForRange(@Param("userId") Long userId,
                                   @Param("startMonth") String startMonth,
                                   @Param("endMonth") String endMonth);

    @Query(value = "SELECT transaction_date, COALESCE(SUM(amount), 0) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND (transaction_type IS NULL OR transaction_type = 'DEBIT') " +
                   "AND (category IS NULL OR category NOT IN ('Income', 'Transfer')) " +
                   "AND transaction_date >= :startDate AND transaction_date < :endDate " +
                   "GROUP BY transaction_date ORDER BY transaction_date",
           nativeQuery = true)
    List<Object[]> getDailySpendingInRange(@Param("userId") Long userId,
                                            @Param("startDate") LocalDate startDate,
                                            @Param("endDate") LocalDate endDate);

    @Query(value = "SELECT transaction_date, COALESCE(SUM(amount), 0) FROM transactions " +
                   "WHERE user_id = :userId " +
                   "AND (transaction_type IS NULL OR transaction_type = 'DEBIT') " +
                   "AND (category IS NULL OR category NOT IN ('Income', 'Transfer')) " +
                   "AND transaction_date >= :startDate AND transaction_date < :endDate " +
                   "AND amount >= :minAmount AND amount <= :maxAmount " +
                   "GROUP BY transaction_date ORDER BY transaction_date",
           nativeQuery = true)
    List<Object[]> getDailySpendingInRangeBounded(@Param("userId") Long userId,
                                                   @Param("startDate") LocalDate startDate,
                                                   @Param("endDate") LocalDate endDate,
                                                   @Param("minAmount") double minAmount,
                                                   @Param("maxAmount") double maxAmount);

    List<Transaction> findByUploadBatchId(String batchId);

    // Returns: [batchId, count, minDate, maxDate, totalAmount, uploadedAt, creditTotal, debitTotal]
    @Query("SELECT t.uploadBatchId, COUNT(t), MIN(t.transactionDate), MAX(t.transactionDate), " +
           "SUM(t.amount), MIN(t.createdAt), " +
           "SUM(CASE WHEN t.transactionType = 'CREDIT' THEN t.amount ELSE 0 END), " +
           "SUM(CASE WHEN t.transactionType != 'CREDIT' OR t.transactionType IS NULL THEN t.amount ELSE 0 END) " +
           "FROM Transaction t WHERE t.user.id = :userId " +
           "GROUP BY t.uploadBatchId ORDER BY MIN(t.createdAt) DESC")
    List<Object[]> findBatchSummaryByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM Transaction t WHERE t.uploadBatchId = :batchId AND t.user.id = :userId")
    void deleteByBatchIdAndUserId(@Param("batchId") String batchId, @Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM Transaction t WHERE t.user.id = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);

    // Returns: [normalized_desc, month_count, occurrence_count,
    //           avg_amount, max_amount, min_amount, last_seen, first_seen, category]
    // Groups by description only so one merchant with a price change (e.g. rent) appears once.
    // CV < 10% filter excludes high-variance merchants (gas, random shopping) that aren't true subscriptions.
    // Groceries and Food & Drink excluded — those are regular spending, never subscriptions.
    @Query(value = """
        SELECT LOWER(TRIM(description))                                 AS normalized_desc,
               COUNT(DISTINCT TO_CHAR(transaction_date, 'YYYY-MM'))     AS month_count,
               COUNT(*)                                                 AS occurrence_count,
               AVG(amount)                                              AS avg_amount,
               MAX(amount)                                              AS max_amount,
               MIN(amount)                                              AS min_amount,
               MAX(transaction_date)                                    AS last_seen,
               MIN(transaction_date)                                    AS first_seen,
               MAX(category)                                            AS category
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer','Groceries','Food & Drink'))
        GROUP BY LOWER(TRIM(description))
        HAVING COUNT(DISTINCT TO_CHAR(transaction_date, 'YYYY-MM')) >= 2
          AND COALESCE(STDDEV(amount) / NULLIF(AVG(amount), 0), 0) < 0.10
        ORDER BY AVG(amount) DESC
        """, nativeQuery = true)
    List<Object[]> findRecurringCharges(@Param("userId") Long userId);

    // Returns: [description, total_spend, visit_count, avg_per_visit, category]
    @Query(value = """
        SELECT description,
               SUM(amount)   AS total_spend,
               COUNT(*)      AS visit_count,
               AVG(amount)   AS avg_per_visit,
               MAX(category) AS category
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY description
        ORDER BY SUM(amount) DESC
        LIMIT 20
        """, nativeQuery = true)
    List<Object[]> getMerchantLeaderboard(@Param("userId") Long userId,
                                          @Param("startMonth") String startMonth,
                                          @Param("endMonth") String endMonth);

    // Returns: [id, transaction_date, description, amount] for a specific subscription
    @Query(value = """
        SELECT id, transaction_date, description, amount
        FROM transactions
        WHERE user_id = :userId
          AND LOWER(TRIM(description)) = :normalizedName
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
        ORDER BY transaction_date DESC
        """, nativeQuery = true)
    List<Object[]> findSubscriptionTransactions(@Param("userId") Long userId,
                                                @Param("normalizedName") String normalizedName);

    // Returns: [description, total_spend] — used for prior-period trend computation
    @Query(value = """
        SELECT description, SUM(amount) AS total_spend
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY description
        """, nativeQuery = true)
    List<Object[]> getMerchantTotalsForPeriod(@Param("userId") Long userId,
                                              @Param("startMonth") String startMonth,
                                              @Param("endMonth") String endMonth);

    // Returns: [id, transaction_date, description, amount, category]
    // Amount filtering is done in Java to avoid nullable numeric issues in native queries.
    @Query(value = """
        SELECT id, transaction_date, description, amount, category
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income', 'Transfer'))
          AND (:keyword = '' OR LOWER(description) LIKE LOWER('%' || :keyword || '%'))
          AND (:startMonth = '' OR TO_CHAR(transaction_date, 'YYYY-MM') >= :startMonth)
          AND (:endMonth = '' OR TO_CHAR(transaction_date, 'YYYY-MM') <= :endMonth)
        ORDER BY transaction_date DESC, amount DESC
        LIMIT 200
        """, nativeQuery = true)
    List<Object[]> searchTransactions(@Param("userId") Long userId,
                                      @Param("keyword") String keyword,
                                      @Param("startMonth") String startMonth,
                                      @Param("endMonth") String endMonth);

    // ── Filtered aggregates for the chat query planner ──────────────────────────
    // Optional predicates use the (:x = '' OR …) pattern so a single query serves
    // both the unfiltered and filtered cases. Amount bounds are always applied via
    // sensible defaults (0 … 1e9) supplied by the caller.

    // Returns: [YYYY-MM, total] — per-month spend totals with optional include/exclude filters.
    @Query(value = """
        SELECT TO_CHAR(transaction_date, 'YYYY-MM') AS ym, SUM(amount) AS total
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND (:category = '' OR category = :category)
          AND (:merchant = '' OR LOWER(description) LIKE LOWER('%' || :merchant || '%'))
          AND (:excludeMerchant = '' OR LOWER(description) NOT LIKE LOWER('%' || :excludeMerchant || '%'))
          AND (:excludeCategory = '' OR category IS NULL OR LOWER(category) <> LOWER(:excludeCategory))
          AND amount >= :minAmount AND amount <= :maxAmount
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY ym ORDER BY ym
        """, nativeQuery = true)
    List<Object[]> getMonthlyTotalsFiltered(@Param("userId") Long userId,
                                            @Param("startMonth") String startMonth,
                                            @Param("endMonth") String endMonth,
                                            @Param("category") String category,
                                            @Param("merchant") String merchant,
                                            @Param("excludeMerchant") String excludeMerchant,
                                            @Param("excludeCategory") String excludeCategory,
                                            @Param("minAmount") double minAmount,
                                            @Param("maxAmount") double maxAmount);

    // Returns: [category, total] — category breakdown over a range with optional filters.
    @Query(value = """
        SELECT category, SUM(amount) AS total
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND (:merchant = '' OR LOWER(description) LIKE LOWER('%' || :merchant || '%'))
          AND (:excludeMerchant = '' OR LOWER(description) NOT LIKE LOWER('%' || :excludeMerchant || '%'))
          AND (:excludeCategory = '' OR category IS NULL OR LOWER(category) <> LOWER(:excludeCategory))
          AND amount >= :minAmount AND amount <= :maxAmount
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY category ORDER BY SUM(amount) DESC
        """, nativeQuery = true)
    List<Object[]> getCategorySummaryForRangeFiltered(@Param("userId") Long userId,
                                                      @Param("startMonth") String startMonth,
                                                      @Param("endMonth") String endMonth,
                                                      @Param("merchant") String merchant,
                                                      @Param("excludeMerchant") String excludeMerchant,
                                                      @Param("excludeCategory") String excludeCategory,
                                                      @Param("minAmount") double minAmount,
                                                      @Param("maxAmount") double maxAmount);

    // Returns: [description, total] — merchant breakdown over a range with optional filters.
    @Query(value = """
        SELECT description, SUM(amount) AS total
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND (:category = '' OR category = :category)
          AND (:excludeMerchant = '' OR LOWER(description) NOT LIKE LOWER('%' || :excludeMerchant || '%'))
          AND (:excludeCategory = '' OR category IS NULL OR LOWER(category) <> LOWER(:excludeCategory))
          AND amount >= :minAmount AND amount <= :maxAmount
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY description ORDER BY SUM(amount) DESC
        LIMIT 30
        """, nativeQuery = true)
    List<Object[]> getMerchantBreakdownFiltered(@Param("userId") Long userId,
                                                @Param("startMonth") String startMonth,
                                                @Param("endMonth") String endMonth,
                                                @Param("category") String category,
                                                @Param("excludeMerchant") String excludeMerchant,
                                                @Param("excludeCategory") String excludeCategory,
                                                @Param("minAmount") double minAmount,
                                                @Param("maxAmount") double maxAmount);

    // Returns: [YYYY-MM, category, total] — feeds category×month matrix charts
    // (stacked bar/area, matrix heatmap).
    @Query(value = """
        SELECT TO_CHAR(transaction_date, 'YYYY-MM') AS ym, category, SUM(amount) AS total
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND (:excludeMerchant = '' OR LOWER(description) NOT LIKE LOWER('%' || :excludeMerchant || '%'))
          AND (:excludeCategory = '' OR category IS NULL OR LOWER(category) <> LOWER(:excludeCategory))
          AND amount >= :minAmount AND amount <= :maxAmount
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        GROUP BY ym, category
        ORDER BY ym
        """, nativeQuery = true)
    List<Object[]> getCategoryMonthMatrix(@Param("userId") Long userId,
                                          @Param("startMonth") String startMonth,
                                          @Param("endMonth") String endMonth,
                                          @Param("excludeMerchant") String excludeMerchant,
                                          @Param("excludeCategory") String excludeCategory,
                                          @Param("minAmount") double minAmount,
                                          @Param("maxAmount") double maxAmount);

    // Returns: [transaction_date, amount, is_anomaly, category, description] — for scatter.
    @Query(value = """
        SELECT transaction_date, amount, is_anomaly, category, description
        FROM transactions
        WHERE user_id = :userId
          AND (transaction_type IS NULL OR transaction_type = 'DEBIT')
          AND (category IS NULL OR category NOT IN ('Income','Transfer'))
          AND (:excludeMerchant = '' OR LOWER(description) NOT LIKE LOWER('%' || :excludeMerchant || '%'))
          AND amount >= :minAmount AND amount <= :maxAmount
          AND TO_CHAR(transaction_date, 'YYYY-MM') BETWEEN :startMonth AND :endMonth
        ORDER BY transaction_date
        """, nativeQuery = true)
    List<Object[]> getTransactionPoints(@Param("userId") Long userId,
                                        @Param("startMonth") String startMonth,
                                        @Param("endMonth") String endMonth,
                                        @Param("excludeMerchant") String excludeMerchant,
                                        @Param("minAmount") double minAmount,
                                        @Param("maxAmount") double maxAmount);
}
