package com.finara.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "financial_reports")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FinancialReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String month;   // e.g. "2025-07"

    @Column(columnDefinition = "TEXT")
    private String narrativeStory;

    @Column(columnDefinition = "TEXT")
    private String categorySummaryJson;   // JSON map {category: total}

    @Column(columnDefinition = "TEXT")
    private String forecastJson;          // JSON from ML service

    @Column(precision = 12, scale = 2)
    private BigDecimal totalSpent;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}