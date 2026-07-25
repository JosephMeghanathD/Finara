package com.finara.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final DataSource dataSource;
    private final RestTemplate mlRestTemplate;

    public HealthController(DataSource dataSource, RestTemplate mlRestTemplate) {
        this.dataSource      = dataSource;
        this.mlRestTemplate  = mlRestTemplate;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        List<Map<String, String>> services = new java.util.ArrayList<>();

        // Backend is always up if this code runs
        services.add(service("Backend", "up", null));

        // Database check
        String dbStatus = "down";
        String dbDetail = null;
        try (Connection c = dataSource.getConnection()) {
            c.isValid(1);
            dbStatus = "up";
        } catch (Exception e) {
            dbDetail = e.getMessage();
        }
        services.add(service("Database", dbStatus, dbDetail));

        // ML Service + active LLM provider check (Google Gemini or Ollama)
        String mlStatus = "down";
        String mlDetail = null;
        String llmName   = "AI Model";
        String llmStatus = "down";
        String llmDetail = null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> mlResp = mlRestTemplate.getForObject("/health", Map.class);
            if (mlResp != null) {
                mlStatus = "ok".equals(mlResp.get("status")) || "degraded".equals(mlResp.get("status")) ? "up" : "down";
                if ("degraded".equals(mlResp.get("status"))) {
                    mlDetail = "degraded";
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> llm = (Map<String, Object>) mlResp.get("llm");
                if (llm != null) {
                    llmName   = (String) llm.getOrDefault("name", "AI Model");
                    llmStatus = "up".equals(llm.get("status")) ? "up" : "down";
                    llmDetail = (String) llm.get("detail");
                }
            }
        } catch (Exception e) {
            mlDetail = e.getMessage();
            llmDetail = "ML service unreachable";
        }
        services.add(service("ML Service", mlStatus, mlDetail));
        services.add(service(llmName, llmStatus, llmDetail));

        // Overall status
        boolean allUp = services.stream().allMatch(s -> "up".equals(s.get("status")));
        boolean anyUp = services.stream().anyMatch(s -> "up".equals(s.get("status")));
        String overall = allUp ? "healthy" : anyUp ? "degraded" : "down";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("overall", overall);
        body.put("services", services);
        body.put("checkedAt", Instant.now().toString());

        return ResponseEntity.ok(body);
    }

    private Map<String, String> service(String name, String status, String detail) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("status", status);
        if (detail != null) m.put("detail", detail);
        return m;
    }
}
