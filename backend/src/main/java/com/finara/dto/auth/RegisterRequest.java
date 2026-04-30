package com.finara.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterRequest {
    @Email @NotBlank  public String email;
    @NotBlank @Size(min = 6) public String password;
    @NotBlank public String firstName;
    public String lastName;
    public Double monthlyIncome;
}
