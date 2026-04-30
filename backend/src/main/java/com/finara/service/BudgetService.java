package com.finara.service;

import com.finara.dto.budget.BudgetRequest;
import com.finara.model.Budget;
import com.finara.model.User;
import com.finara.repository.BudgetRepository;
import com.finara.repository.TransactionRepository;
import com.finara.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.finara.config.TimingContext;
import java.math.BigDecimal;
import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    // ─── UC7: Budget vs Actual ─────────────────────────────────────────────────

    @Cacheable(value = "budgets", key = "#userId + '_' + #month")
    @SuppressWarnings("unchecked")
    public Map<String, Object> getBudgetVsActual(Long userId, String month, boolean includeAnalysis) {
        // Get saved budgets
        long dbStart = System.currentTimeMillis();
        List<Budget> budgets = budgetRepository.findByUserIdAndMonth(userId, month);
        Map<String, Double> budgetMap = new LinkedHashMap<>();
        budgets.forEach(b -> budgetMap.put(b.getCategory(), b.getBudgetAmount().doubleValue()));

        // Get actuals (DEBIT only, exclude internal categories)
        List<Object[]> rows = transactionRepository.getCategorySummaryForMonth(userId, month);
        Set<String> excluded = Set.of("Income", "Transfer");
        Map<String, Double> actualMap = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String cat = row[0] != null ? (String) row[0] : "Other";
            if (!excluded.contains(cat))
                actualMap.put(cat, ((Number) row[1]).doubleValue());
        }

        Double income = transactionRepository.getCreditTotalForRange(userId, month, month);
        double incomeVal = income != null ? income : 0.0;
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        if (budgetMap.isEmpty() || !includeAnalysis) {
            Map<String, Object> result = new HashMap<>();
            result.put("month",  month);
            result.put("budget", budgetMap);
            result.put("actual", actualMap);
            result.put("income", incomeVal);
            if (budgetMap.isEmpty()) result.put("message", "No budget set for this month");
            return result;
        }

        // Ask Gemma for narrative analysis — include income so it can assess affordability
        Map<String, Object> body = new HashMap<>();
        body.put("budget", budgetMap);
        body.put("actual", actualMap);
        body.put("month",  month);
        body.put("income", incomeVal);

        long mlStart = System.currentTimeMillis();
        Map resp = mlRestTemplate.postForObject("/api/ai/budget-vs-actual", body, Map.class);
        TimingContext.recordMlResponse(resp, System.currentTimeMillis() - mlStart);

        Map<String, Object> result = new HashMap<>();
        result.put("month",  month);
        result.put("budget", budgetMap);
        result.put("actual", actualMap);
        result.put("income", incomeVal);
        if (resp != null) result.putAll(resp);

        return result;
    }

    @Transactional
    @CacheEvict(value = "budgets", key = "#userId + '_' + #req.month")
    public Map<String, Object> saveBudget(Long userId, BudgetRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Replace existing budgets for this month
        long dbStart = System.currentTimeMillis();
        budgetRepository.deleteByUserIdAndMonth(userId, req.getMonth());

        List<Budget> saved = new ArrayList<>();
        req.getBudgets().forEach((category, amount) -> {
            Budget b = Budget.builder()
                    .user(user)
                    .month(req.getMonth())
                    .category(category)
                    .budgetAmount(BigDecimal.valueOf(amount))
                    .build();
            saved.add(budgetRepository.save(b));
        });
        TimingContext.record("db_ms", System.currentTimeMillis() - dbStart);

        return Map.of(
                "month",   req.getMonth(),
                "saved",   saved.size(),
                "message", "Budget saved successfully"
        );
    }
}
