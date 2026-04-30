package com.finara;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class FinaraApplication {
    public static void main(String[] args) {
        SpringApplication.run(FinaraApplication.class, args);
    }
}
