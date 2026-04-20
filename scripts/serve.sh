#!/bin/bash

# Configuration
CONTAINER_NAME="spaziolaportaverde_website"

# Function to display help
show_help() {
    echo "Usage: ./serve-local.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --build          Rebuild the Docker image before starting"
    echo "  --watermark      Run the watermark script before starting the server"
    echo "  --help           Show this help message"
}

# Parse arguments
BUILD=false
WATERMARK=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --build) BUILD=true ;;
        --watermark) WATERMARK=true ;;
        --help) show_help; exit 0 ;;
        *) echo "Unknown parameter passed: $1"; show_help; exit 1 ;;
    esac
    shift
done

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build if requested
if [ "$BUILD" = true ]; then
    echo "Building Docker image..."
    docker compose build
fi

# Run watermark script inside container if requested
if [ "$WATERMARK" = true ]; then
    echo "Running watermark script..."
    docker compose run --rm website python scripts/watermark.py \
        --text "© Spazio La Porta Verde" \
        --opacity 45 \
        --font-size 28 \
        --angle -30 \
        --inplace \
        assets/images/ \
        assets/images/
fi

# Start the Hugo server
echo "Starting Hugo server at http://localhost:1313 ..."
docker compose up
