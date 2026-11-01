# AEGIS-OS — Brain (OpenJarvis) Dockerfile
# Runs `jarvis serve` on 0.0.0.0:8000 with the qwen2.5:3b model via Ollama.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# System deps for building any native wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy project manifest + lockfile + source (src needed for uv to register the package)
COPY pyproject.toml uv.lock ./
COPY src ./src

# Install production deps + server extra + the OpenJarvis package itself
# (creates .venv/bin/jarvis entrypoint)
RUN uv sync --frozen --extra server --no-dev

# Data dir for sessions / memory
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 8000

# Bind to 0.0.0.0 so other containers (gateway, console) can reach the brain.
# Model overridden via MODEL env (default qwen2.5:3b in compose).
CMD ["jarvis", "serve", "--host", "0.0.0.0", "--port", "8000"]
