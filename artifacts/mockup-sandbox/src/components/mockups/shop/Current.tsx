import "./_group.css";

type Item = {
  name: string;
  rarity: string;
  price: string;
  preview: string;
  state?: "owned" | "equipped";
};

const items: Item[] = [
  { name: "Classic Blue", rarity: "common", price: "Free", preview: "?", state: "equipped" },
  { name: "Neon Purple", rarity: "rare", price: "🪙 150 MC", preview: "?", state: "owned" },
  { name: "Fire", rarity: "epic", price: "🪙 300 MC", preview: "?", },
  { name: "Galaxy", rarity: "epic", price: "🪙 500 MC", preview: "?", },
  { name: "Gold VIP", rarity: "legendary", price: "🪙 800 MC", preview: "?", },
];

export function Current() {
  return (
    <main className="shop-mock">
      <section className="shop-mock-modal">
        <h1>profile <span className="text-accent">alexMetro</span></h1>
        <div className="profile-coins-display">🪙 Memcoin: <strong className="text-accent">1,240</strong> MC</div>
        <nav className="metro-tabs" aria-label="Profile sections">
          <button className="metro-btn secondary">⚙️</button>
          <button className="metro-btn accent-purple">🛍️</button>
          <button className="metro-btn secondary">📖</button>
          <button className="metro-btn secondary">👑</button>
          <button className="metro-btn secondary">🎀</button>
        </nav>

        <section>
          <h2>🛍️ Магазин</h2>
          <nav className="metro-tabs" aria-label="Shop categories">
            <button className="metro-btn accent-purple">🃏 Рубашки</button>
            <button className="metro-btn secondary">🎨 Фоны</button>
            <button className="metro-btn secondary">🎯 Цвета</button>
            <button className="metro-btn secondary">🖼️ Рамки</button>
            <button className="metro-btn secondary">🏷️ Звания</button>
          </nav>

          <div className="shop-items-grid">
            {items.map((item) => (
              <article className={`shop-item ${item.state ?? ""}`} key={item.name}>
                {item.state === "equipped" && <span className="shop-equipped-badge">Одето</span>}
                <div
                  className="shop-item-preview"
                  style={{ background: item.name === "Classic Blue" ? "#1283b9" : item.name === "Neon Purple" ? "#6a0dad" : item.name === "Fire" ? "linear-gradient(135deg,#ff4500,#ff8c00)" : item.name === "Galaxy" ? "linear-gradient(135deg,#0d0221,#2d1b69)" : "linear-gradient(135deg,#b8860b,#ffd700)" }}
                >
                  {item.preview}
                </div>
                <span className="shop-item-name">{item.name}</span>
                <span className="shop-item-price">{item.price}</span>
                <span className={`shop-item-rarity ${item.rarity}`}>{item.rarity}</span>
                <button className={`metro-btn shop-item-btn ${item.state ? "secondary" : "primary"}`}>
                  {item.state === "equipped" ? "✓ Одето" : item.state === "owned" ? "Надеть" : "Купить"}
                </button>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
