# Generate scaled images for all pictures in assets/images
# 
# NOTE: As of the recent optimization update, this script is now LEGACY and 
# mostly redundant. Hugo now automatically handles WebP conversion and 
# responsive resizing (800w, 1200w, etc.) via the assets/ pipeline and 
# the layouts/partials/responsive-image.html template.
#
# You don't need to run this manually anymore.

TARGET_DIR="assets/images"

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

    img_800="$dir/${name}-800w.webp"
    img_1200="$dir/${name}-1200w.webp"

    if [ ! -f "$img_1200" ]; then
        echo "Generating WebP $img_1200"
        convert "$img" -resize 1200x\> -quality 85 "$img_1200"
    fi

    if [ ! -f "$img_800" ]; then
        echo "Generating WebP $img_800"
        convert "$img" -resize 800x\> -quality 85 "$img_800"
    fi

done

echo "Image processing complete."
