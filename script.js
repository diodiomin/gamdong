const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#main-nav');

menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));

const hero = document.querySelector('.hero');
const slides = [...document.querySelectorAll('.slide')];
const dots = [...document.querySelectorAll('.slide-dots button')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentSlide = 0;
let autoplayTimer;

function showSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === currentSlide));
  dots.forEach((dot, dotIndex) => {
    const active = dotIndex === currentSlide;
    dot.classList.toggle('is-active', active);
    if (active) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
}

function stopAutoplay() {
  window.clearInterval(autoplayTimer);
}

function startAutoplay() {
  stopAutoplay();
  if (!reduceMotion) autoplayTimer = window.setInterval(() => showSlide(currentSlide + 1), 2000);
}

dots.forEach((dot, index) => dot.addEventListener('click', () => {
  showSlide(index);
  startAutoplay();
}));

document.querySelector('.slide-prev')?.addEventListener('click', () => {
  showSlide(currentSlide - 1);
  startAutoplay();
});

document.querySelector('.slide-next')?.addEventListener('click', () => {
  showSlide(currentSlide + 1);
  startAutoplay();
});

hero?.addEventListener('mouseenter', stopAutoplay);
hero?.addEventListener('mouseleave', startAutoplay);
hero?.addEventListener('focusin', stopAutoplay);
hero?.addEventListener('focusout', startAutoplay);
hero?.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') showSlide(currentSlide - 1);
  if (event.key === 'ArrowRight') showSlide(currentSlide + 1);
});
startAutoplay();

const galleryTabs = [...document.querySelectorAll('[data-gallery]')];
const galleryPanels = [...document.querySelectorAll('[data-panel]')];

function selectGallery(name, focusTab = false) {
  galleryTabs.forEach(tab => {
    const active = tab.dataset.gallery === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus();
  });
  galleryPanels.forEach(panel => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
}

galleryTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectGallery(tab.dataset.gallery));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + offset + galleryTabs.length) % galleryTabs.length;
    selectGallery(galleryTabs[nextIndex].dataset.gallery, true);
  });
});

document.querySelectorAll('[data-gallery-target]').forEach(link => {
  link.addEventListener('click', () => selectGallery(link.dataset.galleryTarget));
});

document.querySelectorAll('[data-gallery-nav]').forEach(link => {
  link.addEventListener('click', () => selectGallery(link.dataset.galleryNav));
});

const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox?.querySelector('img');
const lightboxCount = lightbox?.querySelector('.lightbox-count');
const lightboxPrev = lightbox?.querySelector('.lightbox-prev');
const lightboxNext = lightbox?.querySelector('.lightbox-next');
const lightboxClose = lightbox?.querySelector('.lightbox-close');
const lightboxStage = lightbox?.querySelector('.lightbox-stage');
let lightboxPhotos = [];
let lightboxIndex = 0;
let lightboxTouchStartX = 0;

function showLightboxPhoto(index) {
  if (!lightboxImage || !lightboxPhotos.length) return;
  lightboxIndex = (index + lightboxPhotos.length) % lightboxPhotos.length;
  const button = lightboxPhotos[lightboxIndex];
  lightboxImage.src = button.dataset.full;
  lightboxImage.alt = button.querySelector('img')?.alt || '포트폴리오 사진';
  if (lightboxCount) lightboxCount.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
}

function closeLightbox() {
  if (!lightbox?.open) return;
  lightbox.close();
}

document.querySelectorAll('.photo[data-full]').forEach(button => {
  button.addEventListener('click', () => {
    if (!lightbox || !lightboxImage) return;
    const panel = button.closest('[data-panel]');
    lightboxPhotos = [...(panel || document).querySelectorAll('.photo[data-full]')];
    showLightboxPhoto(lightboxPhotos.indexOf(button));
    lightbox.showModal();
    document.body.classList.add('lightbox-open');
  });
});

lightboxPrev?.addEventListener('click', () => showLightboxPhoto(lightboxIndex - 1));
lightboxNext?.addEventListener('click', () => showLightboxPhoto(lightboxIndex + 1));
lightboxClose?.addEventListener('click', closeLightbox);
lightbox?.addEventListener('click', event => {
  if (event.target === lightbox) closeLightbox();
});
lightbox?.addEventListener('close', () => document.body.classList.remove('lightbox-open'));
lightbox?.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showLightboxPhoto(lightboxIndex - 1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showLightboxPhoto(lightboxIndex + 1);
  }
});
lightboxStage?.addEventListener('touchstart', event => {
  lightboxTouchStartX = event.changedTouches[0].clientX;
}, { passive: true });
lightboxStage?.addEventListener('touchend', event => {
  const distance = event.changedTouches[0].clientX - lightboxTouchStartX;
  if (Math.abs(distance) < 45) return;
  showLightboxPhoto(lightboxIndex + (distance < 0 ? 1 : -1));
}, { passive: true });

document.querySelector('#year').textContent = new Date().getFullYear();
