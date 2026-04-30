package com.finara.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "transactions", indexes = {
    @Index(name = "idx_txn_user_date",    columnList = "user_id, transaction_date"),
    @Index(name = "idx_txn_user_anomaly", columnList = "user_id, is_anomaly"),
    @Index(name = "idx_txn_user_batch",   columnList = "user_id, upload_batch_id"),
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false)
    private LocalDate transactionDate;

    private String category;          // set by ML

    @Column(precision = 5, scale = 3)
    private BigDecimal categoryConfidence;

    private String  transactionType;   // "DEBIT" | "CREDIT"
    private Boolean isAnomaly = false;

    @Column(precision = 6, scale = 4)
    private BigDecimal anomalyScore;

    @Column(columnDefinition = "TEXT")
    private String anomalyReason;

    private String merchantName;
    private String rawCsvRow;         // original CSV line for debugging

    @Column(nullable = false)
    private String uploadBatchId;     // groups transactions from the same upload

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.isAnomaly == null) this.isAnomaly = false;
        if (this.transactionType == null) this.transactionType = "DEBIT";
        if ("CREDIT".equals(this.transactionType)) {
            this.isAnomaly    = false;
            this.anomalyScore  = null;
            this.anomalyReason = null;
        }
    }
}