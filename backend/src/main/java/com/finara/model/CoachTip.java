package com.finara.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "coach_tips", indexes = {
    @Index(name = "idx_coach_tips_user_week", columnList = "user_id, week_key")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CoachTip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "week_key", nullable = false)
    private String weekKey;

    @Column(name = "tip_index", nullable = false)
    private int tipIndex;

    @Column(name = "tip_text", nullable = false, columnDefinition = "TEXT")
    private String tipText;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String impact;

    @Column(name = "how_to", columnDefinition = "TEXT")
    private String howTo;

    @Column(nullable = false)
    private boolean done;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
