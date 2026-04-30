package com.finara.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.DefaultUriBuilderFactory;

@Configuration
public class MlServiceConfig {

    @Value("${ml.service.url}")
    private String mlServiceUrl;

    @Bean(name = "mlRestTemplate")
    public RestTemplate mlRestTemplate() {
        RestTemplate rt = new RestTemplate();
        rt.setUriTemplateHandler(new DefaultUriBuilderFactory(mlServiceUrl));
        return rt;
    }
}
