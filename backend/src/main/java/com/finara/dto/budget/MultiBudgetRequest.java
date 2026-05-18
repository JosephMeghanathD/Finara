package com.finara.dto.budget;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.Map;

@Data
public class MultiBudgetRequest {
    @NotNull public Map<String, Map<String, Double>> months; // { "2026-05": { "Food & Drink": 350.0 } }
}
