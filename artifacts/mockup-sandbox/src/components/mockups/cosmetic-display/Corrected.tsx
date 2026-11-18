import './_group.css';

export function Corrected() {
  return (
    <main className="cosmetic-display-page">
      <h1 className="cosmetic-display-heading">
        Metro Memory — косметика игрока
        <small>Звание отделено от имени, рамка обводит игровые и лобби-блоки</small>
      </h1>

      <div className="cosmetic-surface-grid">
        <section className="cosmetic-surface cosmetic-surface-wide">
          <span className="cosmetic-surface-label">Игровая панель</span>
          <div className="metro-status-bar">
            <div className="metro-player-tile active frame-champion">
              <span className="avatar-lg">🎃</span>
              <div className="player-details">
                <span className="player-name">Metro admin</span>
                <span className="game-title-badge">Metro King</span>
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
          <div className="user-profile-trigger frame-champion">
            <span className="user-avatar">🎃</span>
            <span className="profile-user-meta">
              <span className="user-name">Metro admin</span>
              <span className="shop-title-badge">Metro King</span>
            </span>
          </div>
        </section>

        <section className="cosmetic-surface">
          <span className="cosmetic-surface-label">Строка рейтинга</span>
          <div className="metro-list-item leaderboard-entry frame-champion">
            <span className="leaderboard-player">
              <span className="leaderboard-rank">🥇</span>
              <span className="leaderboard-player-avatar">🎃</span>
              <span className="leaderboard-player-meta">
                <span className="leaderboard-player-name">Metro admin</span>
                <small className="leaderboard-player-title">Metro King</small>
              </span>
            </span>
            <b>1 250</b>
          </div>
        </section>

        <section className="cosmetic-surface cosmetic-surface-wide">
          <span className="cosmetic-surface-label">Лобби с косметическим фоном</span>
          <div className="lobby-background-sample corrected-lobby-background">
            Фон доски и мягкая подсветка по краям
          </div>
        </section>
      </div>
    </main>
  );
}
