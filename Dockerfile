# ==============================================================================
# Full-Stack Multi-Stage Dockerfile for Google Course Builder & LMS
# Runtime: Python 3.11 Backend + Node 20 Vite Frontend Build
# ==============================================================================

# Stage 1: Build Frontend Assets
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.11-slim AS runner
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application backend files (every module api_server.py imports)
COPY api_server.py agent_routes.py teacher_auth.py classroom_api.py classroom_course_engine.py \
     course_agent.py course_developer.py course_editor.py ai_model_router.py standards.py \
     stripe_lms_service.py ./
COPY course_curriculum.xlsx credentials.example.json ./

# Copy built frontend assets from stage 1 into dist/
COPY --from=frontend-builder /app/dist ./dist

# Expose backend port
EXPOSE 8000

ENV PORT=8000
ENV PYTHONUNBUFFERED=1
# Listen on all interfaces inside the container (the server is local-only by default)
ENV HOST=0.0.0.0
# Google sign-in returns here; register this exact URL on the OAuth client and override it for your domain
ENV GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/oauth2callback

# Run API server
CMD ["python", "api_server.py", "8000"]
