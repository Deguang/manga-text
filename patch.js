// Initialize Lucide icons for static HTML
function renderIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  } else if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  } else {
    setTimeout(renderIcons, 50);
  }
}
renderIcons();
