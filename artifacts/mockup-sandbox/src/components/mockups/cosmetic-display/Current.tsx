import './_group.css';

export function Current() {
  return (
    <main className="cosmetic-display-page">
      <h1 className="cosmetic-display-heading">
        Metro Memory — косметика игрока
        <small>Текущий вид из исходной разметки и стилей приложения</small>
      </h1>

      <div className="cosmetic-surface-grid">
        <section className="cosmetic-surface cosmetic-surface-wide">
          <span className="cosmetic-surface-label">Игровая панель</span>
          <div className="metro-status-bar">
            <div className="metro-player-tile active">
              <span className="avatar-lg frame-champion">🎃</span>
              <div className="player-details">
                <span className="player-name">Metro admin</span>
                <span className="game-title-badge current-title">Metro King</span>
                <span className="player-score">0</span>
              </div>
            </div>
            <div className="metro-turn-indicator">
              TURN
              <strong>Metro admin</strong>
            </div>
            <div className="metro-player-tile">
              <span className="avatar-lg">🐼</span>
              <div className="player-details">
                <span className="player-name">Другой игрок</span>
                <span className="player-score">5</span>
              </div>
            </div>
          </div>
        </section>

        <section className="cosmetic-surface">
          <span className="cosmetic-surface-label">Профиль в лобби</span>
          <div className="user-profile-trigger">
            <span className="user-avatar frame-champion">🎃</span>
            <span className="user-name">Metro admin</span>
            <span className="shop-title-badge current-title">Metro King</span>
          </div>
        </section>

        <section className="cosmetic-surface">
          <span className="cosmetic-surface-label">Строка рейтинга</span>
          <div className="metro-list-item leaderboard-entry">
            <span className="leaderboard-player">
              <span className="leaderboard-rank">🥇</span>
              <span className="leaderboard-player-avatar frame-champion">🎃</span>
              <span className="leaderboard-player-name">
                Metro admin
                <small className="leaderboard-player-title">Metro King</small>
              </span>
            </span>
            <b>1 250</b>
          </div>
        </section>

        <section className="cosmetic-surface cosmetic-surface-wide">
          <span className="cosmetic-surface-label">Лобби</span>
          <div className="lobby-background-sample">Фон косметики здесь не выделен</div>
        </section>
      </div>
    </main>
  );
}
