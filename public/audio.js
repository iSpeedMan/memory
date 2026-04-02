// 1. Достаем состояние из localStorage при загрузке (короткая запись)
let isMuted = localStorage.getItem('appMuted') === 'true';

// 2. Глобальная функция воспроизведения звука
window.playSnd = function(id) {
    // ОПТИМИЗАЦИЯ: Если звук выключен, просто обрываем функцию. 
    // Это экономит ресурсы браузера.
    if (isMuted) return; 
    
    const audio = document.getElementById('snd-' + id);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
};

// 3. Обработчик кликов для кнопок UI
document.addEventListener('click', (e) => {
    const isClickable = e.target.closest('button') || e.target.closest('.metro-tile') || e.target.closest('.user-profile-trigger');
    const isGameCard = e.target.closest('.card');
    
    // Исключаем кнопки мута, чтобы они не пытались играть звук сами по себе
    const isMuteBtn = e.target.closest('#muteBtn') || e.target.closest('#muteBtn-game');
    
    if (isClickable && !isGameCard && !isMuteBtn) {
        window.playSnd('click');
    }
});

// 4. Управление кнопками интерфейса
const muteBtns = [
    { btn: document.getElementById('muteBtn'), icon: document.getElementById('muteIcon') },
    { btn: document.getElementById('muteBtn-game'), icon: document.getElementById('muteIcon-game') }
];

// Функция обновления внешнего вида кнопок
function updateMuteUI() {
    muteBtns.forEach(pair => {
        if (pair.icon) {
            pair.icon.textContent = isMuted ? '🔈' : '🔊';
        }
        if (pair.btn) {
            // Делаем кнопку полупрозрачной, если звук выключен
            pair.btn.style.opacity = isMuted ? '0.5' : '1';
        }
    });
}

// Обработчик нажатия на кнопку звука
function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('appMuted', isMuted); // Сохраняем в память
    
    updateMuteUI(); // Обновляем иконки

    // Приятная мелочь: если мы только что ВКЛЮЧИЛИ звук, проигрываем тестовый 'клик'
    if (!isMuted) {
        window.playSnd('click');
    }
}

// 5. Инициализация при загрузке страницы
muteBtns.forEach(pair => {
    if (pair.btn) {
        pair.btn.addEventListener('click', toggleMute);
    }
});

// ОБЯЗАТЕЛЬНО: Применяем сохраненный интерфейс (иконки) сразу при заходе на страницу
updateMuteUI();