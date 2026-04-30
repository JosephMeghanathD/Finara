# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM amazoncorretto:17-alpine AS build
WORKDIR /app

# Install Maven
RUN apk add --no-cache maven

# Cache dependencies first
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Build the jar
COPY src ./src
RUN mvn clean package -DskipTests -q

# ── Stage 2: Run ──────────────────────────────────────────────────────────────
FROM amazoncorretto:17-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]