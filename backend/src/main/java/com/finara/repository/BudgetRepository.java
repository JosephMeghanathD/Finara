package com.finara.repository;

import com.finara.model.Budget;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface BudgetRepository extends JpaRepository<Budget, Long> {
    List<Budget> findByUserIdAndMonth(Long userId, String month);
    void deleteByUserIdAndMonth(Long userId, String month);
    void deleteByUserId(Long userId);
}
