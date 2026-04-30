package com.finara.dto.budget;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.Map;

@Data
public class BudgetRequest {
    @NotBlank public String month;               // "2025-07"
    @NotNull  public Map<String, Double> budgets; // { "Food & Drink": 350.0, ... }
}
