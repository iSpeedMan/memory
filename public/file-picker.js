/**
 * Compresses an image file using Canvas API.
 * Resizes to maxDim x maxDim max, outputs JPEG at given quality.
 */
async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 320;
    quality = quality || 0.78;
    return new Promise(function(resolve) {
        if (!file.type.startsWith('image/')) { resolve(file); return; }
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
            URL.revokeObjectURL(url);
            var w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                var ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob(function(blob) {
                if (!blob) { resolve(file); return; }
                var outName = file.name.replace(/\.[^.]+$/, '.jpg');
                resolve(new File([blob], outName, { type: 'image/jpeg' }));
            }, 'image/jpeg', quality);
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

/**
 * Custom styled file picker zone.
 * Usage: initFilePickerZone({ zoneId, inputId, min, max })
 * Returns: { reset(), getFiles(), getCompressedFiles() }
 */
window.initFilePickerZone = function(opts) {
    var zoneId = opts.zoneId, inputId = opts.inputId;
    var min = opts.min != null ? opts.min : 9;
    var max = opts.max != null ? opts.max : 18;

    var zone = document.getElementById(zoneId);
    var input = document.getElementById(inputId);
    if (!zone || !input) return null;

    var countEl = zone.querySelector('.custom-file-zone__count');
    var previewEl = zone.querySelector('.custom-file-zone__previews');

    function updateDisplay(files) {
        var count = files ? files.length : 0;
        if (countEl) {
            var ok = count >= min && count <= max;
            if (count === 0) {
                countEl.textContent = '';
                countEl.style.color = '';
            } else {
                var lang = window.currentLang || 'en';
                countEl.textContent = lang === 'ru'
                    ? ('Выбрано: ' + count + ' (нужно ' + min + '–' + max + ')')
                    : ('Selected: ' + count + ' (need ' + min + '–' + max + ')');
                countEl.style.color = ok ? 'var(--metro-accent)' : 'var(--color-error, #e74c3c)';
            }
        }
        if (previewEl) {
            previewEl.innerHTML = '';
            if (files && count > 0) {
                var shown = Math.min(count, 9);
                for (var i = 0; i < shown; i++) {
                    (function(f) {
                        if (!f.type.startsWith('image/')) return;
                        var img = document.createElement('img');
                        img.className = 'custom-file-zone__thumb';
                        img.alt = f.name;
                        var reader = new FileReader();
                        reader.onload = function(e) { img.src = e.target.result; };
                        reader.readAsDataURL(f);
                        previewEl.appendChild(img);
                    })(files[i]);
                }
                if (count > 9) {
                    var more = document.createElement('span');
                    more.className = 'custom-file-zone__more';
                    more.textContent = '+' + (count - 9);
                    previewEl.appendChild(more);
                }
            }
        }
    }

    input.addEventListener('change', function() { updateDisplay(input.files); });

    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var dt = e.dataTransfer;
        if (dt && dt.files.length) {
            try {
                var transfer = new DataTransfer();
                Array.from(dt.files).forEach(function(f) { transfer.items.add(f); });
                input.files = transfer.files;
            } catch (_) {}
            updateDisplay(input.files);
        }
    });

    var btnEl = zone.querySelector('.custom-file-zone__btn');
    if (btnEl) {
        btnEl.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });
    }

    zone.addEventListener('click', function(e) {
        if (e.target === zone || e.target === zone.querySelector('.custom-file-zone__body')) {
            input.click();
        }
    });

    return {
        reset: function() {
            input.value = '';
            updateDisplay(null);
        },
        getFiles: function() { return input.files; },
        getCompressedFiles: async function() {
            if (!input.files || !input.files.length) return [];
            var files = Array.from(input.files);
            var compressed = await Promise.all(files.map(function(f) {
                return compressImage(f);
            }));
            return compressed;
        }
    };
};
