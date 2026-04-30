package com.finara.dto.ai;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class ChatRequest {
    public String message;
    public String month;           // legacy single-month
    public String startMonth;
    public String endMonth;
    public List<Map<String, String>> history; // [{role, content}, ...]
}
