document.addEventListener('DOMContentLoaded', function () {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function () {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });

        document.querySelectorAll('.nav-item a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
    }

    const header = document.querySelector('.site-header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            header.style.boxShadow = '0 2px 30px rgba(0,0,0,0.1)';
        } else {
            header.style.boxShadow = '0 2px 20px rgba(0,0,0,0.06)';
        }

        lastScroll = currentScroll;
    });

    // Lightbox functionality
    const lightbox = document.getElementById('gallery-lightbox');
    const lightboxImg = lightbox.querySelector('.lightbox-img');
    const lightboxCaption = lightbox.querySelector('.lightbox-caption');
    const lightboxClose = lightbox.querySelector('.lightbox-close');
    const lightboxPrev = lightbox.querySelector('.lightbox-prev');
    const lightboxNext = lightbox.querySelector('.lightbox-next');

    let currentGalleryItems = [];
    let currentIndex = 0;
    let touchStartX = 0;
    let touchEndX = 0;

    // Helper to decode HTML entities
    function decodeHTML(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    function showImage(index) {
        if (currentGalleryItems.length === 0) return;

        currentIndex = index;
        if (currentIndex < 0) currentIndex = currentGalleryItems.length - 1;
        if (currentIndex >= currentGalleryItems.length) currentIndex = 0;

        const item = currentGalleryItems[currentIndex];
        const img = item.querySelector('img');
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        const caption = item.dataset.caption;
        lightboxCaption.textContent = caption ? decodeHTML(caption) : '';
        lightboxCaption.style.display = caption ? 'block' : 'none';
    }

    document.querySelectorAll('.gallery-item').forEach((item) => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            // Find the closest gallery track to isolate navigation to this gallery
            const track = item.closest('.gallery-track');
            if (track) {
                currentGalleryItems = Array.from(track.querySelectorAll('.gallery-item'));
            } else {
                // Fallback for isolated items
                currentGalleryItems = [item];
            }

            const index = currentGalleryItems.indexOf(item);
            showImage(index);
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            showImage(currentIndex - 1);
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener('click', (e) => {
            e.stopPropagation();
            showImage(currentIndex + 1);
        });
    }

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft') {
            showImage(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            showImage(currentIndex + 1);
        }
    });

    // Touch swipe support
    lightbox.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe left - next image
                showImage(currentIndex + 1);
            } else {
                // Swipe right - previous image
                showImage(currentIndex - 1);
            }
        }
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }
});
