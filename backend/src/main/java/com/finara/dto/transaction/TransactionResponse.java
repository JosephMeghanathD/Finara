package com.finara.dto.transaction;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
public class TransactionResponse {
    private Long      id;
    private String    description;
    private BigDecimal amount;
    private LocalDate transactionDate;
    private String    category;
    private BigDecimal categoryConfidence;
    private String    transactionType;
    private Boolean   isAnomaly;
    private BigDecimal anomalyScore;
    private String    anomalyReason;
    private Boolean   manuallyFlagged;
    private String    userFlagReason;
    private String    uploadBatchId;
}
