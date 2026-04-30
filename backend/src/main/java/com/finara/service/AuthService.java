package com.finara.service;

import com.finara.dto.auth.AuthResponse;
import com.finara.dto.auth.LoginRequest;
import com.finara.dto.auth.RegisterRequest;
import com.finara.model.User;
import com.finara.repository.UserRepository;
import com.finara.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthResponse register(RegisterRequest req) {
        if (userRepository.existsByEmail(req.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        User user = User.builder()
                .email(req.getEmail())
                .passwordHash(passwordEncoder.encode(req.getPassword()))
                .firstName(req.getFirstName())
                .lastName(req.getLastName())
                .monthlyIncome(req.getMonthlyIncome() != null
                        ? BigDecimal.valueOf(req.getMonthlyIncome()) : null)
                .build();

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getEmail(), user.getId());
        return new AuthResponse(token, user.getEmail(), user.getFirstName(), user.getId());
    }

    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(req.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId());
        return new AuthResponse(token, user.getEmail(), user.getFirstName(), user.getId());
    }
}
