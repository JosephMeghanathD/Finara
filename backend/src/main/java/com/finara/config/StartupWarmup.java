package com.finara.config;

import com.finara.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * Fires a lightweight DB query immediately after startup to:
 * - pre-warm HikariCP idle connections
 * - trigger Hibernate proxy / query-plan compilation
 * - JIT-compile the Spring Security filter chain and Spring AOP (@Cacheable) paths
 *
 * Without this, all of the above happens on the first real user request,
 * adding 8-13 seconds of latency.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StartupWarmup implements ApplicationListener<ApplicationReadyEvent> {

    private final TransactionRepository transactionRepository;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        CompletableFuture.runAsync(() -> {
            try {
                long t = System.currentTimeMillis();
                transactionRepository.count();
                log.info("Startup warmup done in {}ms — first request will be fast", System.currentTimeMillis() - t);
            } catch (Exception e) {
                log.warn("Startup warmup failed (non-critical): {}", e.getMessage());
            }
        });
    }
}
