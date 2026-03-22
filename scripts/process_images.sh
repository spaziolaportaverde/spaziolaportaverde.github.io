#!/bin/bash
# Generate scaled images for all pictures in static/images

TARGET_DIR="static/images"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Directory $TARGET_DIR not found. Run this from the project root."
    exit 1
fi

echo "Scanning $TARGET_DIR for images to process..."

find "$TARGET_DIR" -type f \( -iname \*.jpg -o -iname \*.jpeg -o -iname \*.png -o -iname \*.webp \) \
    ! -iname "*-800w.*" ! -iname "*-1200w.*" | while read -r img; do
    
    dir=$(dirname "$img")
    base=$(basename "$img")
    ext="${base##*.}"
    name="${base%.*}"

    img_800="$dir/${name}-800w.${ext}"
    img_1200="$dir/${name}-1200w.${ext}"

    if [ ! -f "$img_1200" ]; then
        echo "Generating $img_1200"
        convert "$img" -resize 1200x\> "$img_1200"
    fi

    if [ ! -f "$img_800" ]; then
        echo "Generating $img_800"
        convert "$img" -resize 800x\> "$img_800"
    fi

done

echo "Image processing complete."
