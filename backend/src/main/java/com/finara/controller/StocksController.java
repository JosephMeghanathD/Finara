package com.finara.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

@RestController
@RequestMapping("/api/stocks")
@RequiredArgsConstructor
public class StocksController {

    @Qualifier("mlRestTemplate")
    private final RestTemplate mlRestTemplate;

    /** GET /api/stocks/market — S&P 500, NASDAQ, Dow, VIX */
    @GetMapping("/market")
    public ResponseEntity<Map> marketOverview(HttpServletRequest request) {
        @SuppressWarnings("unchecked")
        Map resp = mlRestTemplate.getForObject("/api/stocks/market", Map.class);
        return ResponseEntity.ok(resp != null ? resp : Map.of("indices", java.util.List.of()));
    }

    /** GET /api/stocks/quote?symbols=AAPL,SBUX */
    @GetMapping("/quote")
    public ResponseEntity<Map> quote(@RequestParam String symbols, HttpServletRequest request) {
        String url = UriComponentsBuilder.fromPath("/api/stocks/quote")
                .queryParam("symbols", symbols)
                .toUriString();
        @SuppressWarnings("unchecked")
        Map resp = mlRestTemplate.getForObject(url, Map.class);
        return ResponseEntity.ok(resp != null ? resp : Map.of("quotes", java.util.List.of()));
    }

    /** POST /api/stocks/match-merchants  { merchants: [{name, total_spent}] } */
    @PostMapping("/match-merchants")
    public ResponseEntity<Map> matchMerchants(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        @SuppressWarnings("unchecked")
        Map resp = mlRestTemplate.postForObject("/api/stocks/match-merchants", body, Map.class);
        return ResponseEntity.ok(resp != null ? resp : Map.of("matches", java.util.List.of()));
    }

    /** POST /api/stocks/sector-etfs  { categories: { "Food & Drink": 420.0 } } */
    @PostMapping("/sector-etfs")
    public ResponseEntity<Map> sectorEtfs(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        @SuppressWarnings("unchecked")
        Map resp = mlRestTemplate.postForObject("/api/stocks/sector-etfs", body, Map.class);
        return ResponseEntity.ok(resp != null ? resp : Map.of("sector_etfs", java.util.List.of()));
    }
}
