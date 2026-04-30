package com.finara.repository;

import com.finara.model.FinancialReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface FinancialReportRepository extends JpaRepository<FinancialReport, Long> {
    List<FinancialReport> findByUserIdOrderByMonthDesc(Long userId);
    Optional<FinancialReport> findByUserIdAndMonth(Long userId, String month);
    void deleteByUserId(Long userId);
}
