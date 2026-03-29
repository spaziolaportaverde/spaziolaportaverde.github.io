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

    // Check if we have a hero to make header transparent
    const hasHero = document.querySelector('.hero') !== null;
    if (hasHero) {
        header.classList.add('transparent-capable');
    }

    const checkScroll = () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            header.classList.add('scrolled');
            header.style.boxShadow = '0 2px 30px rgba(0,0,0,0.1)';
        } else {
            header.classList.remove('scrolled');
            header.style.boxShadow = hasHero ? 'none' : '0 2px 20px rgba(0,0,0,0.06)';
        }
        
        lastScroll = currentScroll;
    };
    
    // Initial check
    checkScroll();

    window.addEventListener('scroll', checkScroll);

    // Lightbox functionality
    const lightbox = document.getElementById('gallery-lightbox');

    if (!lightbox) return;

    const lightboxImg = lightbox.querySelector('.lightbox-img');
    const lightboxCaption = lightbox.querySelector('.lightbox-caption');
    const lightboxClose = lightbox.querySelector('.lightbox-close');
    const lightboxPrev = lightbox.querySelector('.lightbox-prev');
    const lightboxNext = lightbox.querySelector('.lightbox-next');

    const zoomInBtn = lightbox.querySelector('.lightbox-zoom-in');
    const zoomOutBtn = lightbox.querySelector('.lightbox-zoom-out');
    const zoom100Btn = lightbox.querySelector('.lightbox-zoom-100');
    const zoomResetBtn = lightbox.querySelector('.lightbox-zoom-reset');

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let startPanX = 0;
    let startPanY = 0;

    function applyZoom(transition = true) {
        if (!transition) {
            lightboxImg.classList.add('grabbing');
        } else {
            lightboxImg.classList.remove('grabbing');
        }
        if (scale > 1) {
            lightboxImg.classList.add('grabbable');
        } else {
            lightboxImg.classList.remove('grabbable');
        }
        lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function resetZoom() {
        scale = 1;
        panX = 0;
        panY = 0;
        applyZoom(true);
    }

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

    function parseCaption(text) {
        if (!text) return null;
        const lines = text.split('\n');
        let meta = {};
        let description = [];
        let hasMeta = false;
        
        lines.forEach(line => {
            const match = line.match(/^(Title|Titolo|Author|Autore|Year|Anno|Technique|Tecnica|Dimensions|Dimensioni):\s*(.*)/i);
            if (match) {
                hasMeta = true;
                meta[match[1].toLowerCase()] = match[2];
            } else if (line.trim() !== '') {
                description.push(line);
            }
        });

        if (!hasMeta) {
            return { text: text, isStructured: false };
        }
        
        const title = meta.title || meta.titolo || '';
        const author = meta.author || meta.autore || '';
        const year = meta.year || meta.anno || '';
        const technique = meta.technique || meta.tecnica || '';
        const dimensions = meta.dimensions || meta.dimensioni || '';
        
        return { 
            title, author, year, technique, dimensions, 
            description: description.join('<br>'), 
            isStructured: true 
        };
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
        const captionRaw = item.dataset.caption;
        
        if (captionRaw) {
            const decoded = decodeHTML(captionRaw);
            const parsed = parseCaption(decoded);
            
            if (parsed.isStructured) {
                let metaHtml = '';
                if (parsed.year) metaHtml += `<span>${parsed.year}</span>`;
                if (parsed.technique) metaHtml += `<span>${parsed.technique}</span>`;
                if (parsed.dimensions) metaHtml += `<span>${parsed.dimensions}</span>`;
                
                let html = '<div class="gallery-label">';
                html += `<button class="gallery-label__toggle" title="Mostra/Nascondi">−</button>`;
                if (parsed.title) html += `<div class="gallery-label__title">${parsed.title}</div>`;
                if (parsed.author) html += `<div class="gallery-label__author">${parsed.author}</div>`;
                if (metaHtml) html += `<div class="gallery-label__meta">${metaHtml}</div>`;
                if (parsed.description) html += `<div class="gallery-label__desc">${parsed.description}</div>`;
                html += '</div>';
                
                lightboxCaption.innerHTML = html;
                lightboxCaption.classList.remove('caption-collapsed');

                // Wire up the toggle button
                const toggleBtn = lightboxCaption.querySelector('.gallery-label__toggle');
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const collapsed = lightboxCaption.classList.toggle('caption-collapsed');
                        toggleBtn.textContent = collapsed ? '+' : '−';
                    });
                }
            } else {
                lightboxCaption.innerHTML = `<div class="gallery-label"><div class="gallery-label__desc">${parsed.text}</div></div>`;
            }
            lightboxCaption.style.display = 'block';
        } else {
            lightboxCaption.innerHTML = '';
            lightboxCaption.style.display = 'none';
        }

        resetZoom();
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

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            scale = Math.min(scale + 0.5, 4);
            applyZoom();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            scale = Math.max(scale - 0.5, 1);
            if (scale === 1) { panX = 0; panY = 0; }
            applyZoom();
        });
    }

    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetZoom();
        });
    }

    if (zoom100Btn) {
        zoom100Btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lightboxImg.naturalWidth && lightboxImg.clientWidth) {
                // Determine scale by ratio of native res vs current screen rect
                const targetScale = lightboxImg.naturalWidth / lightboxImg.clientWidth;
                // Add a small threshold so it doesn't snap if they're basically identical
                if (targetScale > 1.05 || targetScale < 0.95) {
                    scale = targetScale;
                    panX = 0;
                    panY = 0;
                    applyZoom();
                } else {
                    resetZoom();
                }
            }
        });
    }

    // Mouse wheel zoom
    lightbox.addEventListener('wheel', (e) => {
        if (!lightbox.classList.contains('active')) return;
        e.preventDefault();
        const zoomSpeed = 0.1;
        if (e.deltaY < 0) {
            scale = Math.min(scale + zoomSpeed, 4);
        } else {
            scale = Math.max(scale - zoomSpeed, 1);
            if (scale === 1) { panX = 0; panY = 0; }
        }
        applyZoom();
    }, { passive: false });

    // Drag to pan
    lightboxImg.addEventListener('mousedown', (e) => {
        if (scale <= 1) return;
        e.preventDefault();
        isDragging = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        applyZoom(false);
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        applyZoom(false);
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            applyZoom(true);
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
        resetZoom();
    }
});

// ── Theme filter ──────────────────────────────────────────────────────────────
document.querySelectorAll('.theme-filter').forEach(function (filterBar) {
    const gridId = filterBar.dataset.grid;
    const grid = gridId ? document.getElementById(gridId) : null;

    filterBar.querySelectorAll('.theme-filter__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const theme = btn.dataset.theme;

            // Update active button
            filterBar.querySelectorAll('.theme-filter__btn').forEach(function (b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');

            // Show/hide cards
            const cards = grid
                ? grid.querySelectorAll('.mostre-card')
                : document.querySelectorAll('.mostre-card');

            cards.forEach(function (card) {
                if (theme === '*') {
                    card.classList.remove('theme-hidden');
                } else {
                    const cardTheme = (card.dataset.theme || '').toLowerCase().trim();
                    if (cardTheme === theme) {
                        card.classList.remove('theme-hidden');
                    } else {
                        card.classList.add('theme-hidden');
                    }
                }
            });
        });
    });
});

