package com.finara.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Injects request timing into every API response automatically.
 * Map responses get a "_timing" key in the JSON body.
 * List / other responses get an "X-Timing" response header (JSON string).
 */
@ControllerAdvice
public class TimingBodyAdvice implements ResponseBodyAdvice<Object> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public boolean supports(MethodParameter returnType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Object beforeBodyWrite(Object body,
                                  MethodParameter returnType,
                                  MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request,
                                  ServerHttpResponse response) {
        Map<String, Object> timing = TimingContext.build();

        if (body instanceof Map) {
            Map<String, Object> result = new LinkedHashMap<>();
            ((Map) body).forEach((k, v) -> result.put(String.valueOf(k), v));
            result.put("_timing", timing);
            return result;
        }

        // Non-Map responses (lists, single objects) — add timing as response header
        try {
            response.getHeaders().add("X-Timing", MAPPER.writeValueAsString(timing));
        } catch (Exception ignored) {}
        return body;
    }
}
