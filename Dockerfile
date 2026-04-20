# Use Python 3.12-slim as base to match CI environment
FROM python:3.12-slim

# Hugo version to install
ARG HUGO_VERSION=0.160.1

# Install system dependencies
# - wget/ca-certificates: for downloading Hugo
# - imagemagick/fonts-liberation: for image processing scripts
# - git: Hugo needs git for some features (like submodules/versioning)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    imagemagick \
    fonts-liberation \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Hugo Extended
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-64bit.tar.gz"; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-arm64.tar.gz"; \
    fi && \
    wget -O hugo.tar.gz "$HUGO_URL" && \
    tar -xzf hugo.tar.gz && \
    mv hugo /usr/local/bin/hugo && \
    rm hugo.tar.gz

# Install Python dependencies
# Matches requirements in .github/workflows/hugo.yaml
RUN pip install --no-cache-dir \
    "Pillow>=10.0.0" \
    "numpy>=1.24.0" \
    "invisible-watermark>=0.1.5"

# Set working directory
WORKDIR /src

# Expose Hugo default port
EXPOSE 1313

# Default command: serve the site
CMD ["hugo", "server", "--bind", "0.0.0.0", "--buildDrafts", "--buildFuture", "--disableFastRender"]
