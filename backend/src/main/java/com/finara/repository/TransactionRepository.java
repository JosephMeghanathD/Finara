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
}
