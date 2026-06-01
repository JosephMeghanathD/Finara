package com.finara.repository;

import com.finara.model.CoachTip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface CoachTipRepository extends JpaRepository<CoachTip, Long> {
    List<CoachTip> findByUserIdAndWeekKeyOrderByTipIndex(Long userId, String weekKey);

    boolean existsByUserIdAndWeekKey(Long userId, String weekKey);

    @Transactional
    void deleteByUserIdAndWeekKey(Long userId, String weekKey);
}
