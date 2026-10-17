// 金句預覽與圖片下載介面；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    $, modals, t, getRenderer, toast,
    document,
  }) {

    function initHighlightFeature() {
      const highlightModal = $('#highlight-modal');
      if (!highlightModal) return;

      const btnOpen = $('#btn-highlight');
      const btnClose = $('#highlight-close');
      const btnCancel = $('#highlight-cancel');
      const btnDownload = $('#highlight-download');

      const inputQuote = $('#highlight-quote-input');
      const inputAuthor = $('#highlight-author-input');
      const charCount = $('#highlight-char-count');

      const displayQuote = $('#hc-quote-display');
      const displayAuthor = $('#hc-author-display');
      const displayDate = $('#hc-date-display');
      const cardPreview = $('#highlight-card-preview');

      function openHighlight() {
        inputQuote.value = '';
        inputAuthor.value = '';
        updatePreview();
        modals.open('highlight-modal');
      }

      function closeHighlight() {
        modals.close('highlight-modal');
      }

      function updatePreview() {
        displayQuote.textContent = inputQuote.value || t('highlight.quote_default');
        displayAuthor.textContent = inputAuthor.value ? `— ${inputAuthor.value}` : `— ${t('highlight.author_default')}`;

        if (charCount) {
          charCount.textContent = `${inputQuote.value.length} / 200`;
        }

        const now = new Date();
        displayDate.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      }

      function downloadHighlightCard() {
        if (typeof getRenderer() !== 'function') {
          toast(t('highlight.msg_html2canvas_fail'));
          return;
        }

        // Briefly remove rounded corners from wrapper if html2canvas struggles with overflow:hidden
        // (Optional, usually fine)

        getRenderer()(cardPreview, {
          scale: 2,
          backgroundColor: null,
          useCORS: true
        }).then(canvas => {
          const link = document.createElement('a');
          link.download = `highlight-${Date.now()}.jpg`;
          link.href = canvas.toDataURL('image/jpeg', 0.9);
          link.click();

          toast(t('highlight.msg_download_success'));
          closeHighlight();
        }).catch(err => {
          console.error('html2canvas error:', err);
          toast(t('highlight.msg_download_fail'));
        });
      }

      if (btnOpen) btnOpen.addEventListener('click', openHighlight);
      if (btnClose) btnClose.addEventListener('click', closeHighlight);
      if (btnCancel) btnCancel.addEventListener('click', closeHighlight);

      if (inputQuote) inputQuote.addEventListener('input', updatePreview);
      if (inputAuthor) inputAuthor.addEventListener('input', updatePreview);

      if (btnDownload) btnDownload.addEventListener('click', downloadHighlightCard);
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      initHighlightFeature();
    }

    return { bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.HighlightUI = api;
})();
