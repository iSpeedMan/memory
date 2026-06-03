/**
 * Custom styled file picker zone.
 * Usage: initFilePickerZone({ zoneId, inputId, min, max, counterSelector })
 */
window.initFilePickerZone = function({ zoneId, inputId, min = 9, max = 18, onchange }) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    const countEl = zone.querySelector('.custom-file-zone__count');
    const previewEl = zone.querySelector('.custom-file-zone__previews');

    function updateDisplay(files) {
        const count = files ? files.length : 0;
        if (countEl) {
            const ok = count >= min && count <= max;
            if (count === 0) {
                countEl.textContent = '';
                countEl.style.color = '';
            } else {
                const lang = window.currentLang || 'en';
                countEl.textContent = lang === 'ru'
                    ? `Выбрано: ${count} (нужно ${min}–${max})`
                    : `Selected: ${count} (need ${min}–${max})`;
                countEl.style.color = ok ? 'var(--metro-accent)' : 'var(--color-error, #e74c3c)';
            }
        }
        if (previewEl) {
            previewEl.innerHTML = '';
            if (files && count > 0) {
                const shown = Math.min(count, 9);
                for (let i = 0; i < shown; i++) {
                    const f = files[i];
                    if (!f.type.startsWith('image/')) continue;
                    const img = document.createElement('img');
                    img.className = 'custom-file-zone__thumb';
                    img.alt = f.name;
                    const reader = new FileReader();
                    reader.onload = e => { img.src = e.target.result; };
                    reader.readAsDataURL(f);
                    previewEl.appendChild(img);
                }
                if (count > 9) {
                    const more = document.createElement('span');
                    more.className = 'custom-file-zone__more';
                    more.textContent = `+${count - 9}`;
                    previewEl.appendChild(more);
                }
            }
        }
        if (typeof onchange === 'function') onchange(files);
    }

    input.addEventListener('change', () => updateDisplay(input.files));

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const dt = e.dataTransfer;
        if (dt && dt.files.length) {
            try {
                const dataTransfer = new DataTransfer();
                Array.from(dt.files).forEach(f => dataTransfer.items.add(f));
                input.files = dataTransfer.files;
            } catch (_) {}
            updateDisplay(input.files);
        }
    });

    zone.querySelector('.custom-file-zone__btn')?.addEventListener('click', e => {
        e.stopPropagation();
        input.click();
    });

    zone.addEventListener('click', e => {
        if (e.target === zone || e.target.classList.contains('custom-file-zone__body')) {
            input.click();
        }
    });

    return {
        reset() {
            input.value = '';
            updateDisplay(null);
        },
        getFiles() { return input.files; }
    };
};
