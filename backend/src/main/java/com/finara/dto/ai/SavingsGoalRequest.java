package com.finara.dto.ai;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SavingsGoalRequest {
    @NotNull @Min(1) public Double goalAmount;
    @NotNull @Min(1) public Integer timeframeMonths;
    public String month;       // legacy single-month
    public String startMonth;
    public String endMonth;
}
