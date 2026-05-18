package com.finara.controller;

import com.finara.dto.ai.*;
import com.finara.service.AiService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;
    private final CacheManager cacheManager;

    /**
     * Fast financial summary for the story page — no AI call, pure DB.
     * GET /api/ai/story/data?startMonth=2026-04&endMonth=2026-04
     */
    @GetMapping("/story/data")
    public ResponseEntity<Map<String, Object>> getStoryData(
            @RequestParam String startMonth,
            @RequestParam(required = false) String endMonth,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        String end  = endMonth != null ? endMonth : startMonth;
        return ResponseEntity.ok(aiService.getStoryData(userId, startMonth, end));
    }

    /**
     * UC8: Generate monthly financial story via Gemma.
     * POST /api/ai/story  { "month": "2025-07" }
     */
    @PostMapping("/story")
    public ResponseEntity<Map<String, Object>> generateStory(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        String startMonth = body.getOrDefault("startMonth", body.get("month"));
        String endMonth   = body.getOrDefault("endMonth", startMonth);
        if ("true".equals(body.get("refresh"))) {
            Cache cache = cacheManager.getCache("stories");
            if (cache != null) cache.evict(userId + "_" + startMonth + "_" + endMonth);
        }
        return ResponseEntity.ok(aiService.generateStory(userId, startMonth, endMonth));
    }

    /**
     * UC9: Explain why a transaction was flagged.
     * POST /api/ai/explain-anomaly  { "transactionId": 42 }
     */
    @PostMapping("/explain-anomaly")
    public ResponseEntity<Map<String, Object>> explainAnomaly(
            @RequestBody Map<String, Long> body,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        Long txnId  = body.get("transactionId");
        return ResponseEntity.ok(aiService.explainAnomaly(userId, txnId));
    }

    /**
     * UC10: Savings goal reality check.
     * POST /api/ai/reality-check
     */
    @PostMapping("/reality-check")
    public ResponseEntity<Map<String, Object>> realityCheck(
            @Valid @RequestBody SavingsGoalRequest req,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(aiService.realityCheck(userId, req));
    }

    /**
     * UC11: Generate smart savings plan.
     * POST /api/ai/savings-plan
     */
    @PostMapping("/savings-plan")
    public ResponseEntity<Map<String, Object>> savingsPlan(
            @Valid @RequestBody SavingsGoalRequest req,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(aiService.createSavingsPlan(userId, req));
    }

    /**
     * UC12: Interactive financial Q&A chat.
     * POST /api/ai/chat  { "message": "...", "history": [...], "month": "2025-07" }
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(
            @RequestBody ChatRequest req,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        return ResponseEntity.ok(aiService.chat(userId, req));
    }

    /**
     * UC13: Explain a mysterious merchant name.
     * POST /api/ai/explain-merchant  { "merchantName": "AMZN MKTP US*AB12" }
     */
    @PostMapping("/explain-merchant")
    public ResponseEntity<Map<String, Object>> explainMerchant(
            @RequestBody Map<String, String> body) {

        return ResponseEntity.ok(aiService.explainMerchant(body.get("merchantName")));
    }

    /**
     * UC14: Weekly spending habit coaching tips.
     * GET /api/ai/coach?week=2025-W30&refresh=true
     * refresh=true evicts the cache for this user+week before regenerating.
     */
    @GetMapping("/coach")
    public ResponseEntity<Map<String, Object>> coach(
            @RequestParam(required = false) String week,
            @RequestParam(required = false) Boolean refresh,
            HttpServletRequest request) {

        Long userId = (Long) request.getAttribute("userId");
        if (Boolean.TRUE.equals(refresh)) {
            Cache cache = cacheManager.getCache("coach");
            if (cache != null) cache.evict(userId + "_" + (week != null ? week : "current"));
        }
        return ResponseEntity.ok(aiService.getWeeklyCoachTips(userId, week));
    }
}
