import { useMemo, useState, type CSSProperties } from "react";

type Category =
  | "card_skin"
  | "board_bg"
  | "match_color"
  | "avatar_frame"
  | "title"
  | "name_color";

type ShopItem = {
  id: string;
  category: Category;
  name: string;
  description: string;
  rarity: "Обычный" | "Редкий" | "Эпический" | "Легендарный";
  price: number;
  owned: boolean;
  equipped: boolean;
  color: string;
  secondary?: string;
  symbol?: string;
  label?: string;
};

const categories: { id: Category; name: string; mark: string; planned?: boolean }[] = [
  { id: "card_skin", name: "Рубашки карт", mark: "▤" },
  { id: "board_bg", name: "Фоны поля", mark: "▦" },
  { id: "match_color", name: "Цвет пары", mark: "●" },
  { id: "avatar_frame", name: "Рамки аватара", mark: "□" },
  { id: "title", name: "Звания", mark: "Aa" },
  { id: "name_color", name: "Цвет имени", mark: "Aa", planned: true },
];

const initialItems: ShopItem[] = [
  {
    id: "card-azure",
    category: "card_skin",
    name: "Городской лазурь",
    description: "Лаконичная синяя рубашка с фирменным знаком Metro.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#0879a8",
    secondary: "#16a9d8",
    symbol: "M",
  },
  {
    id: "card-night",
    category: "card_skin",
    name: "Ночной маршрут",
    description: "Глубокий индиго и тонкие линии ночной схемы.",
    rarity: "Редкий",
    price: 180,
    owned: true,
    equipped: false,
    color: "#17234e",
    secondary: "#354b8e",
    symbol: "M",
  },
  {
    id: "card-signal",
    category: "card_skin",
    name: "Сигнальный янтарь",
    description: "Тёплый контрастный акцент на рубашке карты.",
    rarity: "Эпический",
    price: 320,
    owned: false,
    equipped: false,
    color: "#a94d18",
    secondary: "#e6a63a",
    symbol: "M",
  },
  {
    id: "board-grid",
    category: "board_bg",
    name: "Схема линий",
    description: "Спокойная сетка помогает сосредоточиться на ходе.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#173340",
    secondary: "#24768d",
  },
  {
    id: "board-deep",
    category: "board_bg",
    name: "Станция «Север»",
    description: "Холодный градиент с мягким свечением платформы.",
    rarity: "Редкий",
    price: 240,
    owned: false,
    equipped: false,
    color: "#112d3d",
    secondary: "#32758b",
  },
  {
    id: "match-cyan",
    category: "match_color",
    name: "Чистый сигнал",
    description: "Бирюзовый цвет для найденной пары и игровых акцентов.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#16b5c2",
  },
  {
    id: "match-coral",
    category: "match_color",
    name: "Коралловый импульс",
    description: "Мягкий коралловый акцент для ваших совпадений.",
    rarity: "Редкий",
    price: 160,
    owned: false,
    equipped: false,
    color: "#e87861",
  },
  {
    id: "frame-steel",
    category: "avatar_frame",
    name: "Стальной контур",
    description: "Тонкая металлическая рамка вокруг аватара.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#99b3bf",
  },
  {
    id: "frame-copper",
    category: "avatar_frame",
    name: "Медный кант",
    description: "Тёплая рамка, заметная, но не отвлекающая от матча.",
    rarity: "Эпический",
    price: 290,
    owned: false,
    equipped: false,
    color: "#d58b54",
  },
  {
    id: "title-rider",
    category: "title",
    name: "Игрок метро",
    description: "Компактное звание рядом с именем в лобби.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#79c7e1",
    label: "ИГРОК МЕТРО",
  },
  {
    id: "title-navigator",
    category: "title",
    name: "Знаток маршрутов",
    description: "Звание для тех, кто быстро находит верный путь.",
    rarity: "Редкий",
    price: 360,
    owned: false,
    equipped: false,
    color: "#e7b56b",
    label: "ЗНАТОК МАРШРУТОВ",
  },
  {
    id: "name-mint",
    category: "name_color",
    name: "Мятный акцент",
    description: "Окрашивает ваше имя в лобби и на экране матча.",
    rarity: "Обычный",
    price: 0,
    owned: true,
    equipped: true,
    color: "#75d2b2",
  },
  {
    id: "name-coral",
    category: "name_color",
    name: "Коралловый акцент",
    description: "Добавляет имени тёплый цвет, видимый обоим игрокам.",
    rarity: "Редкий",
    price: 220,
    owned: false,
    equipped: false,
    color: "#f08b72",
  },
];

const rarityClass: Record<ShopItem["rarity"], string> = {
  Обычный: "common",
  Редкий: "rare",
  Эпический: "epic",
  Легендарный: "legendary",
};

function itemCountLabel(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun =
    remainder100 >= 11 && remainder100 <= 14
      ? "предметов"
      : remainder10 === 1
        ? "предмет"
        : remainder10 >= 2 && remainder10 <= 4
          ? "предмета"
          : "предметов";
  return `${count} ${noun}`;
}

function ItemArt({ item, compact = false }: { item: ShopItem; compact?: boolean }) {
  const style = {
    "--item-color": item.color,
    "--item-secondary": item.secondary ?? item.color,
  } as CSSProperties;

  return (
    <div
      className={`mm-art mm-art--${item.category}${compact ? " mm-art--compact" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {item.category === "card_skin" && (
        <div className="mm-card-face">
          <span className="mm-card-mark">{item.symbol}</span>
          <span className="mm-card-corner">M</span>
        </div>
      )}
      {item.category === "board_bg" && (
        <div className="mm-board-preview">
          {Array.from({ length: 9 }, (_, index) => (
            <span className={index === 4 ? "mm-board-cell mm-board-cell--active" : "mm-board-cell"} key={index}>
              {index === 4 ? "M" : ""}
            </span>
          ))}
        </div>
      )}
      {item.category === "match_color" && (
        <div className="mm-match-preview">
          <span />
          <span />
          <i />
        </div>
      )}
      {item.category === "avatar_frame" && (
        <div className="mm-frame-avatar">AM</div>
      )}
      {item.category === "title" && (
        <span className="mm-title-preview">{item.label}</span>
      )}
      {item.category === "name_color" && (
        <span className="mm-name-preview">alexMetro</span>
      )}
    </div>
  );
}

export function ShopFlow() {
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [balance, setBalance] = useState(1240);
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("card-azure");
  const [notice, setNotice] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesOwned = !ownedOnly || item.owned;
      const matchesQuery =
        !query ||
        `${item.name} ${item.description} ${item.rarity}`
          .toLocaleLowerCase("ru")
          .includes(query);
      return matchesCategory && matchesOwned && matchesQuery;
    });
  }, [items, category, ownedOnly, search]);

  const selectedItem =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const equippedItems = items.filter((item) => item.equipped);

  function chooseCategory(next: Category | "all") {
    setCategory(next);
    setNotice("");
  }

  function purchase(item: ShopItem) {
    if (item.owned || item.price > balance) return;
    setBalance((current) => current - item.price);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, owned: true } : entry,
      ),
    );
    setNotice(`«${item.name}» добавлен в коллекцию. Теперь его можно надеть.`);
  }

  function equip(item: ShopItem) {
    if (!item.owned || item.equipped) return;
    setItems((current) =>
      current.map((entry) =>
        entry.category === item.category
          ? { ...entry, equipped: entry.id === item.id }
          : entry,
      ),
    );
    setNotice(`«${item.name}» теперь используется в профиле.`);
  }

  function actionFor(item: ShopItem, detail = false) {
    if (item.equipped) {
      return (
        <button className="mm-action mm-action--quiet" type="button" disabled>
          Уже экипировано
        </button>
      );
    }
    if (item.owned) {
      return (
        <button className="mm-action mm-action--primary" type="button" onClick={() => equip(item)}>
          Экипировать
        </button>
      );
    }
    if (item.price === 0) {
      return (
        <button className="mm-action mm-action--primary" type="button" onClick={() => purchase(item)}>
          Забрать бесплатно
        </button>
      );
    }
    const canAfford = balance >= item.price;
    return (
      <button
        className={`mm-action ${canAfford ? "mm-action--primary" : "mm-action--quiet"}`}
        type="button"
        disabled={!canAfford}
        onClick={() => purchase(item)}
        aria-label={
          canAfford
            ? `Купить «${item.name}» за ${item.price} Memcoin`
            : `Недостаточно Memcoin для покупки «${item.name}»`
        }
      >
        {detail ? (
          <>
            Купить за <span className="mm-button-price">{item.price} MC</span>
          </>
        ) : (
          <>Купить · {item.price} MC</>
        )}
      </button>
    );
  }

  const equippedForCategory = (id: Category) =>
    equippedItems.find((item) => item.category === id);

  if (!isOpen) {
    return (
      <main className="mm-shop-shell">
        <style>{styles}</style>
        <div className="mm-closed-card">
          <div className="mm-brand-mark">M</div>
          <p className="mm-eyebrow">METRO MEMORY · ПРОФИЛЬ</p>
          <h1>Профиль свернут</h1>
          <p>Магазин и выбранные косметические предметы сохранены в этом макете.</p>
          <button className="mm-action mm-action--primary" type="button" onClick={() => setIsOpen(true)}>
            Вернуться в магазин
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mm-shop-shell">
      <style>{styles}</style>
      <section className="mm-profile-modal" aria-label="Профиль игрока: магазин">
        <header className="mm-profile-head">
          <div className="mm-profile-identity">
            <div className="mm-user-avatar" aria-label="Аватар alexMetro">AM</div>
            <div className="mm-user-copy">
              <p className="mm-eyebrow">METRO MEMORY <span>/</span> ПРОФИЛЬ</p>
              <h1>alexMetro</h1>
              <span className="mm-profile-subtitle">Настройте образ для следующего матча</span>
            </div>
          </div>
          <div className="mm-balance" aria-label={`Баланс: ${balance} Memcoin`}>
            <span className="mm-coin-icon" aria-hidden="true">M</span>
            <span className="mm-balance-copy">
              <small>ВАШ БАЛАНС</small>
              <strong>{balance.toLocaleString("ru-RU")} <i>MC</i></strong>
            </span>
            <span className="mm-balance-note">Memcoin</span>
          </div>
          <button
            className="mm-close"
            type="button"
            aria-label="Свернуть профиль"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </header>

        <div className="mm-profile-context">
          <span className="mm-context-kicker">ПРОФИЛЬ ИГРОКА</span>
          <span className="mm-context-divider" />
          <span className="mm-context-current">Магазин</span>
          <span className="mm-context-spacer" />
          <span className="mm-context-count">{itemCountLabel(items.filter((item) => item.owned).length)} в коллекции</span>
        </div>

        <section className="mm-shop-content" aria-labelledby="mm-shop-title">
          <div className="mm-shop-heading">
            <div>
              <p className="mm-eyebrow mm-eyebrow--blue">КОЛЛЕКЦИЯ ИГРОКА</p>
              <h2 id="mm-shop-title">Магазин</h2>
              <p className="mm-heading-copy">Выберите детали образа. Перед покупкой можно посмотреть каждую.</p>
            </div>
            <div className="mm-shop-mark" aria-hidden="true">
              <span>MM</span>
              <i />
            </div>
          </div>

          <section className="mm-equipped-strip" aria-label="Текущая косметика">
            <div className="mm-equipped-title">
              <span className="mm-live-dot" />
              <div>
                <strong>Сейчас в игре</strong>
                <small>Ваш образ в лобби и матче</small>
              </div>
            </div>
            <div className="mm-equipped-list">
              {categories.map((entry) => {
                const item = equippedForCategory(entry.id);
                return (
                  <div className="mm-equipped-chip" key={entry.id} title={`${entry.name}: ${item?.name ?? "не выбрано"}`}>
                    <span className="mm-chip-mark">{entry.mark}</span>
                    <span className="mm-chip-copy">
                      <small>{entry.name}</small>
                      <strong>{item?.name ?? "Не выбрано"}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mm-browse-toolbar">
            <div className="mm-browse-label">
              <span className="mm-section-index">01</span>
              <span>Найти предмет</span>
            </div>
            <label className="mm-search">
              <span className="mm-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по названию"
                aria-label="Поиск предметов по названию"
              />
              {search && (
                <button type="button" aria-label="Очистить поиск" onClick={() => setSearch("")}>×</button>
              )}
            </label>
            <label className={`mm-owned-toggle${ownedOnly ? " is-active" : ""}`}>
              <input
                type="checkbox"
                checked={ownedOnly}
                onChange={(event) => setOwnedOnly(event.target.checked)}
              />
              <span className="mm-toggle-track"><i /></span>
              <span>Только мои</span>
            </label>
            <span className="mm-result-count" aria-live="polite">{itemCountLabel(visibleItems.length)}</span>
          </div>

          <div className="mm-shop-layout">
            <nav className="mm-category-nav" aria-label="Категории магазина">
              <p className="mm-nav-heading">КАТЕГОРИИ</p>
              <button
                className={`mm-category-button${category === "all" ? " is-active" : ""}`}
                type="button"
                aria-pressed={category === "all"}
                onClick={() => chooseCategory("all")}
              >
                <span className="mm-category-mark">⌘</span>
                <span>Все предметы</span>
                <small>{items.length}</small>
              </button>
              {categories.map((entry) => (
                <button
                  className={`mm-category-button${category === entry.id ? " is-active" : ""}`}
                  type="button"
                  key={entry.id}
                  aria-pressed={category === entry.id}
                  onClick={() => chooseCategory(entry.id)}
                >
                  <span className="mm-category-mark">{entry.mark}</span>
                  <span>{entry.name}</span>
                  {entry.planned ? <small className="mm-planned-label">новый тип</small> : null}
                </button>
              ))}
              <div className="mm-category-foot">
                <span className="mm-foot-line" />
                <p>Косметика меняет внешний вид, но не влияет на ход игры.</p>
              </div>
            </nav>

            <section className="mm-catalog" aria-label="Каталог предметов">
              <div className="mm-catalog-heading">
                <div>
                  <span className="mm-catalog-overline">{category === "all" ? "ВЕСЬ АССОРТИМЕНТ" : categories.find((entry) => entry.id === category)?.name.toLocaleUpperCase("ru")}</span>
                  <h3>{category === "all" ? "Выберите свой стиль" : categories.find((entry) => entry.id === category)?.name}</h3>
                </div>
                <span className="mm-catalog-hint">Нажмите «Подробнее», чтобы открыть предпросмотр</span>
              </div>
              {notice && (
                <div className="mm-notice" role="status">
                  <span className="mm-notice-check">✓</span>
                  <span>{notice}</span>
                  <button type="button" aria-label="Скрыть сообщение" onClick={() => setNotice("")}>×</button>
                </div>
              )}
              {visibleItems.length ? (
                <div className="mm-product-grid">
                  {visibleItems.map((item) => {
                    const status = item.equipped
                      ? "Экипировано"
                      : item.owned
                        ? "В коллекции"
                        : "Не куплено";
                    return (
                      <article className={`mm-product${selectedItem?.id === item.id ? " is-selected" : ""}`} key={item.id}>
                        <div className="mm-product-topline">
                          <span className={`mm-rarity mm-rarity--${rarityClass[item.rarity]}`}>
                            <i />{item.rarity}
                          </span>
                          {item.equipped ? (
                            <span className="mm-equipped-label"><i />Надето</span>
                          ) : item.owned ? (
                            <span className="mm-owned-label">Моё</span>
                          ) : null}
                        </div>
                        <button
                          className="mm-product-preview-button"
                          type="button"
                          aria-label={`Подробнее о предмете «${item.name}»`}
                          aria-pressed={selectedItem?.id === item.id}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <ItemArt item={item} compact />
                        </button>
                        <div className="mm-product-copy">
                          <h4>{item.name}</h4>
                          <p>{item.description}</p>
                        </div>
                        <div className="mm-product-meta">
                          <span className={`mm-status-label${item.equipped ? " is-equipped" : item.owned ? " is-owned" : ""}`}>
                            {status}
                          </span>
                          <strong className={item.price === 0 ? "is-free" : ""}>
                            {item.price === 0 ? "Бесплатно" : `${item.price} MC`}
                          </strong>
                        </div>
                        <div className="mm-product-actions">
                          <button
                            className="mm-details-button"
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-label={`Открыть предпросмотр: ${item.name}`}
                          >
                            Подробнее <span aria-hidden="true">↗</span>
                          </button>
                          {actionFor(item)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mm-empty-state">
                  <div className="mm-empty-symbol">⌕</div>
                  <h4>Ничего не нашлось</h4>
                  <p>Измените запрос или покажите весь ассортимент.</p>
                  <button
                    className="mm-empty-reset"
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setOwnedOnly(false);
                      setCategory("all");
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}
            </section>

            <aside className="mm-detail-panel" aria-label="Предпросмотр и детали предмета">
              {selectedItem ? (
                <>
                  <div className="mm-detail-head">
                    <div>
                      <span className="mm-detail-kicker">ПРЕДПРОСМОТР</span>
                      <h3>Детали предмета</h3>
                    </div>
                    <span className="mm-detail-number">02</span>
                  </div>
                  <div className="mm-detail-art-wrap">
                    <span className="mm-detail-art-caption">ВНЕШНИЙ ВИД</span>
                    <ItemArt item={selectedItem} />
                  </div>
                  <div className="mm-detail-name-row">
                    <div>
                      <span className={`mm-rarity mm-rarity--${rarityClass[selectedItem.rarity]}`}>
                        <i />{selectedItem.rarity}
                      </span>
                      <h4>{selectedItem.name}</h4>
                    </div>
                    <strong className="mm-detail-price">
                      {selectedItem.price === 0 ? "Бесплатно" : `${selectedItem.price} MC`}
                    </strong>
                  </div>
                  <p className="mm-detail-description">{selectedItem.description}</p>
                  <div className="mm-effect-note">
                    <span className="mm-effect-icon">↗</span>
                    <span>
                      <strong>Что изменится</strong>
                      <small>{categories.find((entry) => entry.id === selectedItem.category)?.name} в вашем профиле и матче.</small>
                    </span>
                  </div>
                  <div className="mm-player-preview">
                    <div className="mm-player-preview-top">
                      <span>В ЛОББИ</span>
                      <span className="mm-preview-live"><i />ПРЕДПРОСМОТР</span>
                    </div>
                    <div className="mm-player-row">
                      <div
                        className="mm-preview-avatar"
                        style={{
                          borderColor:
                            selectedItem.category === "avatar_frame"
                              ? selectedItem.color
                              : equippedForCategory("avatar_frame")?.color,
                          boxShadow: `0 0 0 2px ${selectedItem.category === "avatar_frame" ? selectedItem.color : equippedForCategory("avatar_frame")?.color}55`,
                        }}
                      >
                        AM
                      </div>
                      <div className="mm-preview-identity">
                        <strong
                          style={{
                            color:
                              selectedItem.category === "name_color"
                                ? selectedItem.color
                                : equippedForCategory("name_color")?.color,
                          }}
                        >
                          alexMetro
                        </strong>
                        <span>{selectedItem.category === "title" ? selectedItem.label : equippedForCategory("title")?.label}</span>
                      </div>
                      <div className="mm-preview-match-dot" style={{ background: selectedItem.category === "match_color" ? selectedItem.color : equippedForCategory("match_color")?.color }} />
                    </div>
                    <div className="mm-preview-footnote">Так предмет будет выглядеть рядом с вашим профилем</div>
                  </div>
                  <div className="mm-detail-status">
                    <span>Состояние</span>
                    <strong className={selectedItem.equipped ? "is-equipped" : selectedItem.owned ? "is-owned" : ""}>
                      {selectedItem.equipped ? "Экипировано" : selectedItem.owned ? "В коллекции" : "Не куплено"}
                    </strong>
                  </div>
                  {selectedItem.price > 0 && !selectedItem.owned && balance < selectedItem.price && (
                    <p className="mm-balance-warning">Не хватает {selectedItem.price - balance} MC</p>
                  )}
                  <div className="mm-detail-action">{actionFor(selectedItem, true)}</div>
                  <p className="mm-no-surprises">Стоимость указана до покупки. Подтверждение не требуется.</p>
                </>
              ) : (
                <div className="mm-detail-empty">
                  <span className="mm-detail-kicker">ПРЕДПРОСМОТР</span>
                  <h3>Выберите предмет</h3>
                  <p>Здесь появятся его эффект, состояние и внешний вид.</p>
                </div>
              )}
            </aside>
          </div>
        </section>
        <footer className="mm-modal-footer">
          <span><i /> Косметические предметы не меняют игровые правила</span>
          <span>METRO MEMORY <b>·</b> ИГРАЙ СВОИМ СТИЛЕМ</span>
        </footer>
      </section>
    </main>
  );
}

const styles = `
  .mm-shop-shell {
    --mm-ink: #111b23;
    --mm-surface: #182630;
    --mm-surface-raised: #21343f;
    --mm-line: #334955;
    --mm-text: #e5eef0;
    --mm-muted: #91a5ae;
    --mm-dim: #617781;
    --mm-blue: #18a8d5;
    --mm-blue-deep: #087da6;
    --mm-coin: #e9ba58;
    min-height: 100dvh;
    padding: 28px;
    color: var(--mm-text);
    background:
      linear-gradient(90deg, rgba(40, 77, 91, .10) 1px, transparent 1px),
      linear-gradient(rgba(40, 77, 91, .10) 1px, transparent 1px),
      #101920;
    background-size: 40px 40px;
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    box-sizing: border-box;
  }
  .mm-shop-shell *, .mm-shop-shell *::before, .mm-shop-shell *::after { box-sizing: border-box; }
  .mm-profile-modal {
    width: min(100%, 1360px);
    margin: 0 auto;
    overflow: hidden;
    background: var(--mm-ink);
    border: 1px solid #344a55;
    box-shadow: 0 28px 80px rgba(0, 0, 0, .35);
  }
  .mm-profile-head {
    display: flex;
    align-items: center;
    gap: 22px;
    min-height: 96px;
    padding: 18px 25px;
    background: #192832;
    border-bottom: 1px solid var(--mm-line);
  }
  .mm-profile-identity { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
  .mm-user-avatar {
    display: grid;
    width: 53px;
    height: 53px;
    flex: 0 0 auto;
    place-items: center;
    border: 2px solid #2487a6;
    background: #223a46;
    color: #b4e8f3;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: .08em;
  }
  .mm-user-copy { min-width: 0; }
  .mm-eyebrow, .mm-detail-kicker, .mm-catalog-overline, .mm-nav-heading {
    margin: 0;
    color: #8ea5af;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .15em;
  }
  .mm-eyebrow span { color: #52707d; padding: 0 4px; }
  .mm-user-copy h1 {
    margin: 2px 0 0;
    color: #e7f2f4;
    font-size: 22px;
    line-height: 1.18;
    font-weight: 700;
    letter-spacing: -.035em;
  }
  .mm-profile-subtitle { display: block; margin-top: 4px; color: #93a8b0; font-size: 11px; }
  .mm-balance {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 225px;
    padding: 10px 13px;
    border: 1px solid #4c5360;
    background: #202e36;
  }
  .mm-coin-icon {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid #d9ad50;
    border-radius: 50%;
    color: #f3cd70;
    font-size: 13px;
    font-weight: 800;
  }
  .mm-balance-copy { display: flex; flex: 1; flex-direction: column; gap: 1px; }
  .mm-balance-copy small { color: #a9b2ae; font-size: 8px; font-weight: 700; letter-spacing: .11em; }
  .mm-balance-copy strong { color: #f1d17d; font-size: 19px; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .mm-balance-copy i { color: #c5a558; font-size: 10px; font-style: normal; }
  .mm-balance-note { color: #71868e; font-size: 9px; align-self: end; padding-bottom: 2px; }
  .mm-close {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #40535d;
    background: transparent;
    color: #a7b6bb;
    font: inherit;
    font-size: 21px;
    line-height: 1;
    cursor: pointer;
    transition: transform .16s ease, opacity .16s ease;
  }
  .mm-close:hover { background: #2b3d46; color: white; }
  .mm-profile-context {
    display: flex;
    align-items: center;
    min-height: 36px;
    gap: 11px;
    padding: 0 26px;
    background: #13212a;
    border-bottom: 1px solid #293d47;
    color: #7c939d;
    font-size: 9px;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .mm-context-kicker { font-weight: 700; }
  .mm-context-divider { width: 1px; height: 13px; background: #38515c; }
  .mm-context-current { color: #5bc0df; font-weight: 800; }
  .mm-context-spacer { flex: 1; }
  .mm-context-count { color: #718791; letter-spacing: .02em; text-transform: none; }
  .mm-shop-content { padding: 25px 26px 22px; }
  .mm-shop-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 19px; }
  .mm-eyebrow--blue { margin-bottom: 5px; color: #48b5d5; }
  .mm-shop-heading h2 { margin: 0; color: #edf5f5; font-size: 29px; letter-spacing: -.05em; line-height: 1; }
  .mm-heading-copy { margin: 7px 0 0; color: #92a6af; font-size: 12px; }
  .mm-shop-mark {
    position: relative;
    display: grid;
    width: 54px;
    height: 54px;
    place-items: center;
    border: 1px solid #355b69;
    background: #16303b;
    color: #78cee2;
    font-size: 17px;
    font-weight: 900;
    letter-spacing: -.08em;
  }
  .mm-shop-mark i { position: absolute; right: -4px; bottom: -4px; width: 9px; height: 9px; background: #e4b653; border: 2px solid var(--mm-ink); }
  .mm-equipped-strip {
    display: flex;
    align-items: stretch;
    gap: 15px;
    min-height: 74px;
    padding: 10px 13px;
    background: #182832;
    border: 1px solid #2d454f;
    border-left: 3px solid #168db2;
  }
  .mm-equipped-title { display: flex; align-items: center; gap: 9px; width: 150px; flex: 0 0 auto; }
  .mm-live-dot { width: 7px; height: 7px; background: #58c8a5; box-shadow: 0 0 0 3px rgba(88, 200, 165, .12); }
  .mm-equipped-title strong { display: block; color: #dce9eb; font-size: 11px; }
  .mm-equipped-title small { display: block; margin-top: 3px; color: #7e949d; font-size: 9px; }
  .mm-equipped-list { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: center; gap: 5px; flex: 1; min-width: 0; }
  .mm-equipped-chip { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 5px 7px; border-left: 1px solid #314651; }
  .mm-chip-mark { display: grid; width: 22px; height: 22px; flex: 0 0 auto; place-items: center; color: #76bfd4; font-size: 11px; font-weight: 700; }
  .mm-chip-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .mm-chip-copy small { color: #8096a0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8px; }
  .mm-chip-copy strong { color: #c9dadd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-weight: 600; }
  .mm-browse-toolbar { display: flex; align-items: center; gap: 15px; margin: 23px 0 13px; }
  .mm-browse-label { display: flex; align-items: center; gap: 8px; min-width: 150px; color: #cbdadd; font-size: 12px; font-weight: 700; }
  .mm-section-index { color: #4fb4d2; font-size: 9px; letter-spacing: .08em; }
  .mm-search { display: flex; align-items: center; height: 37px; gap: 9px; flex: 1; min-width: 170px; padding: 0 10px; background: #172630; border: 1px solid #314954; }
  .mm-search:focus-within { border-color: #2299bb; box-shadow: 0 0 0 2px rgba(34, 153, 187, .12); }
  .mm-search-icon { position: relative; width: 13px; height: 13px; flex: 0 0 auto; border: 1.5px solid #77939e; border-radius: 50%; }
  .mm-search-icon::after { position: absolute; right: -4px; bottom: -2px; width: 6px; height: 1.5px; background: #77939e; content: ""; transform: rotate(45deg); }
  .mm-search input { width: 100%; border: 0; outline: 0; background: transparent; color: #e0ebed; font: inherit; font-size: 11px; }
  .mm-search input::placeholder { color: #71868f; }
  .mm-search input::-webkit-search-cancel-button { display: none; }
  .mm-search button { border: 0; background: transparent; color: #96aab1; font-size: 18px; cursor: pointer; }
  .mm-owned-toggle { display: flex; align-items: center; gap: 8px; color: #9eb0b6; font-size: 10px; white-space: nowrap; cursor: pointer; }
  .mm-owned-toggle input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .mm-toggle-track { display: flex; width: 30px; height: 17px; align-items: center; padding: 2px; border: 1px solid #41545d; background: #273840; }
  .mm-toggle-track i { width: 11px; height: 11px; background: #91a4aa; transition: transform .16s ease, opacity .16s ease; }
  .mm-owned-toggle.is-active .mm-toggle-track { background: #117a9a; border-color: #208eae; }
  .mm-owned-toggle.is-active .mm-toggle-track i { transform: translateX(12px); background: #e2f6f7; }
  .mm-owned-toggle input:focus-visible + .mm-toggle-track { outline: 2px solid #68cce2; outline-offset: 2px; }
  .mm-result-count { color: #748a93; font-size: 9px; white-space: nowrap; }
  .mm-shop-layout { display: grid; grid-template-columns: 176px minmax(0, 1fr) 282px; align-items: start; gap: 15px; }
  .mm-category-nav { padding: 13px 9px 10px; background: #17252e; border: 1px solid #2b414b; }
  .mm-nav-heading { padding: 0 8px 9px; color: #748c96; font-size: 8px; }
  .mm-category-button {
    display: flex;
    width: 100%;
    min-height: 37px;
    align-items: center;
    gap: 9px;
    padding: 0 8px;
    border: 1px solid transparent;
    background: transparent;
    color: #a5b7bd;
    text-align: left;
    font: inherit;
    font-size: 10px;
    cursor: pointer;
    transition: transform .15s ease, opacity .15s ease;
  }
  .mm-category-button + .mm-category-button { margin-top: 2px; }
  .mm-category-button:hover { background: #20343d; color: #e4f0f2; }
  .mm-category-button.is-active { border-color: #1d7088; background: #173947; color: #c5f0f6; }
  .mm-category-button.is-active::before { width: 2px; height: 17px; margin-left: -8px; background: #27b6d8; content: ""; }
  .mm-category-mark { display: grid; width: 19px; flex: 0 0 auto; place-items: center; color: #75b8ca; font-size: 12px; font-weight: 700; }
  .mm-category-button small { margin-left: auto; color: #7a929a; font-size: 9px; }
  .mm-category-button .mm-planned-label { color: #e8bd69; font-size: 7px; white-space: nowrap; text-transform: uppercase; }
  .mm-category-foot { margin: 17px 7px 0; padding-top: 10px; border-top: 1px solid #2d424b; }
  .mm-foot-line { display: block; width: 25px; height: 2px; background: #d4a74f; }
  .mm-category-foot p { margin: 7px 0 0; color: #71868f; font-size: 9px; line-height: 1.5; }
  .mm-catalog { min-width: 0; }
  .mm-catalog-heading { display: flex; min-height: 48px; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 1px 1px 9px; }
  .mm-catalog-overline { color: #6f8b95; font-size: 8px; }
  .mm-catalog-heading h3 { margin: 3px 0 0; color: #e0ebed; font-size: 16px; font-weight: 700; letter-spacing: -.025em; }
  .mm-catalog-hint { max-width: 155px; padding-top: 4px; color: #71868f; font-size: 8px; line-height: 1.4; text-align: right; }
  .mm-notice { display: flex; align-items: center; gap: 8px; margin: 0 0 9px; padding: 8px 10px; border: 1px solid #367b6d; background: #17342f; color: #b5e5d4; font-size: 10px; }
  .mm-notice-check { color: #70d1ad; font-weight: 900; }
  .mm-notice button { margin-left: auto; border: 0; background: transparent; color: #a4c9bd; font: inherit; font-size: 17px; cursor: pointer; }
  .mm-product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .mm-product {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 10px;
    border: 1px solid #2b424c;
    background: #192831;
    transition: transform .16s ease, opacity .16s ease;
  }
  .mm-product:hover { transform: translateY(-2px); border-color: #47626e; background: #1c2e38; }
  .mm-product.is-selected { border-color: #1d91b2; background: #1b303b; box-shadow: inset 0 0 0 1px rgba(28, 148, 180, .12); }
  .mm-product-topline { display: flex; min-height: 17px; align-items: center; justify-content: space-between; gap: 5px; }
  .mm-rarity { display: inline-flex; align-items: center; gap: 5px; color: #8da1a8; font-size: 8px; white-space: nowrap; }
  .mm-rarity i { width: 5px; height: 5px; background: #84999f; }
  .mm-rarity--rare { color: #69b9d7; }
  .mm-rarity--rare i { background: #55b9db; }
  .mm-rarity--epic { color: #c196dc; }
  .mm-rarity--epic i { background: #b17bcc; }
  .mm-rarity--legendary { color: #e2bd69; }
  .mm-rarity--legendary i { background: #e5b84e; }
  .mm-equipped-label, .mm-owned-label { display: inline-flex; align-items: center; gap: 4px; color: #77d1b3; font-size: 8px; white-space: nowrap; }
  .mm-equipped-label i { width: 5px; height: 5px; background: #70d0ad; }
  .mm-owned-label { color: #8fc3d0; }
  .mm-product-preview-button { display: grid; width: 100%; height: 82px; place-items: center; margin: 5px 0 7px; padding: 0; border: 1px solid #314a55; background: #14232c; cursor: pointer; }
  .mm-product-preview-button:focus-visible, .mm-details-button:focus-visible, .mm-action:focus-visible, .mm-category-button:focus-visible, .mm-empty-reset:focus-visible, .mm-close:focus-visible { outline: 2px solid #70cde1; outline-offset: 2px; }
  .mm-product-copy { min-height: 42px; }
  .mm-product-copy h4 { overflow: hidden; margin: 0; color: #e0eaec; font-size: 11px; line-height: 1.3; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .mm-product-copy p { display: -webkit-box; overflow: hidden; margin: 4px 0 0; color: #879ca4; font-size: 9px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .mm-product-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 24px; margin-top: 6px; border-top: 1px solid #2a3e47; }
  .mm-product-meta > strong { color: #e6c66e; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mm-product-meta > strong.is-free { color: #73c9a8; }
  .mm-status-label { color: #85979d; font-size: 8px; }
  .mm-status-label.is-owned { color: #83bac8; }
  .mm-status-label.is-equipped { color: #77d0b0; }
  .mm-product-actions { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .mm-details-button { display: inline-flex; min-width: 67px; align-items: center; gap: 3px; justify-content: center; padding: 0 3px; border: 0; background: transparent; color: #87b7c5; font: inherit; font-size: 8px; cursor: pointer; }
  .mm-details-button:hover { color: #b6e6f0; }
  .mm-details-button span { font-size: 11px; }
  .mm-action {
    display: inline-flex;
    min-height: 29px;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 1;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 0;
    font: inherit;
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
    transition: transform .15s ease, opacity .15s ease;
  }
  .mm-action--primary { border-color: #168ab0; background: #087da2; color: #f1fbfc; }
  .mm-action--primary:hover:not(:disabled) { border-color: #35b7d5; background: #1199bd; }
  .mm-action--quiet { border-color: #344750; background: #25353d; color: #a4b4b8; }
  .mm-action:disabled { opacity: .72; cursor: not-allowed; }
  .mm-button-price { color: #f3d782; }
  .mm-empty-state { display: flex; min-height: 270px; flex-direction: column; align-items: center; justify-content: center; padding: 25px; border: 1px dashed #3a525c; background: #17252e; text-align: center; }
  .mm-empty-symbol { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid #395764; color: #7cb6c6; font-size: 25px; }
  .mm-empty-state h4 { margin: 13px 0 0; color: #e0ebec; font-size: 14px; }
  .mm-empty-state p { margin: 5px 0 12px; color: #8ba0a7; font-size: 10px; }
  .mm-empty-reset { border: 0; background: transparent; color: #62c1dc; font: inherit; font-size: 10px; cursor: pointer; }
  .mm-detail-panel { min-width: 0; padding: 13px; border: 1px solid #344b55; background: #1b2a33; }
  .mm-detail-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .mm-detail-kicker { color: #5abbd7; font-size: 8px; }
  .mm-detail-head h3, .mm-detail-empty h3 { margin: 4px 0 0; color: #e6eff1; font-size: 15px; letter-spacing: -.02em; }
  .mm-detail-number { color: #536b75; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
  .mm-detail-art-wrap { position: relative; display: grid; height: 126px; place-items: center; overflow: hidden; margin-top: 11px; border: 1px solid #354b55; background: #14232b; }
  .mm-detail-art-caption { position: absolute; top: 7px; left: 8px; z-index: 1; color: rgba(194, 215, 219, .62); font-size: 7px; letter-spacing: .12em; }
  .mm-detail-name-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 7px; margin-top: 11px; }
  .mm-detail-name-row h4 { margin: 4px 0 0; color: #e4eef0; font-size: 14px; line-height: 1.2; }
  .mm-detail-price { color: #e5c36b; font-size: 10px; white-space: nowrap; }
  .mm-detail-description { margin: 7px 0 0; color: #95a8ae; font-size: 10px; line-height: 1.55; }
  .mm-effect-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 11px; padding: 8px; border-left: 2px solid #d4aa51; background: #26343a; }
  .mm-effect-icon { color: #e5c36b; font-size: 14px; line-height: 1; }
  .mm-effect-note strong { display: block; color: #d7e3e4; font-size: 9px; }
  .mm-effect-note small { display: block; margin-top: 3px; color: #92a5a9; font-size: 8px; line-height: 1.4; }
  .mm-player-preview { margin-top: 12px; border: 1px solid #324851; background: #14232b; }
  .mm-player-preview-top { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; border-bottom: 1px solid #2c424b; color: #77919a; font-size: 7px; font-weight: 800; letter-spacing: .11em; }
  .mm-preview-live { display: inline-flex; align-items: center; gap: 4px; color: #78bfa8; font-size: 6px; }
  .mm-preview-live i { width: 4px; height: 4px; background: #62c6a5; }
  .mm-player-row { display: flex; align-items: center; gap: 9px; padding: 10px 9px 7px; }
  .mm-preview-avatar { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 2px solid #90aab2; background: #263c46; color: #d5e6e9; font-size: 9px; font-weight: 800; }
  .mm-preview-identity { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
  .mm-preview-identity strong { overflow: hidden; color: #78d0b3; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .mm-preview-identity span { width: fit-content; max-width: 100%; overflow: hidden; padding: 2px 4px; background: #263945; color: #80bfd0; font-size: 6px; text-overflow: ellipsis; white-space: nowrap; }
  .mm-preview-match-dot { width: 10px; height: 10px; border: 2px solid rgba(255,255,255,.3); border-radius: 50%; }
  .mm-preview-footnote { padding: 0 9px 8px; color: #738991; font-size: 7px; }
  .mm-detail-status { display: flex; align-items: center; justify-content: space-between; margin-top: 11px; color: #869ba2; font-size: 9px; }
  .mm-detail-status strong { color: #a0b0b5; font-size: 9px; }
  .mm-detail-status strong.is-owned { color: #80becb; }
  .mm-detail-status strong.is-equipped { color: #76cfad; }
  .mm-balance-warning { margin: 7px 0 0; color: #e3a57d; font-size: 9px; }
  .mm-detail-action { margin-top: 9px; }
  .mm-detail-action .mm-action { width: 100%; min-height: 36px; font-size: 10px; }
  .mm-no-surprises { margin: 7px 0 0; color: #748990; font-size: 7px; text-align: center; }
  .mm-detail-empty { display: flex; min-height: 250px; flex-direction: column; justify-content: center; }
  .mm-detail-empty p { color: #899da5; font-size: 10px; line-height: 1.5; }
  .mm-modal-footer { display: flex; min-height: 38px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 26px; border-top: 1px solid #2c414a; background: #14222b; color: #71868e; font-size: 8px; letter-spacing: .06em; }
  .mm-modal-footer span:first-child { display: inline-flex; align-items: center; gap: 7px; letter-spacing: 0; }
  .mm-modal-footer i { width: 5px; height: 5px; background: #53b9d1; }
  .mm-modal-footer b { color: #be9e52; padding: 0 3px; }
  .mm-art { --item-color: #1686a9; --item-secondary: #35b5d2; position: relative; display: grid; width: 100%; height: 100%; place-items: center; overflow: hidden; }
  .mm-art--compact { width: 100%; height: 100%; }
  .mm-art--card_skin { background: linear-gradient(125deg, var(--item-color), var(--item-secondary)); }
  .mm-card-face { position: relative; display: grid; width: 43px; height: 59px; place-items: center; border: 1px solid rgba(222, 247, 250, .58); background: linear-gradient(145deg, rgba(255,255,255,.08), rgba(0,0,0,.12)); box-shadow: 3px 4px 0 rgba(0,0,0,.22); }
  .mm-card-face::before, .mm-card-face::after { position: absolute; width: 27px; height: 1px; background: rgba(231, 250, 250, .26); content: ""; transform: rotate(-38deg); }
  .mm-card-face::after { transform: rotate(38deg); }
  .mm-card-mark { position: relative; z-index: 1; color: rgba(239, 252, 252, .9); font-size: 17px; font-weight: 900; }
  .mm-card-corner { position: absolute; right: 4px; bottom: 3px; color: rgba(226, 250, 252, .58); font-size: 6px; font-weight: 800; }
  .mm-art--compact .mm-card-face { width: 36px; height: 48px; }
  .mm-art--compact .mm-card-mark { font-size: 14px; }
  .mm-art--board_bg { background: linear-gradient(135deg, var(--item-color), var(--item-secondary)); }
  .mm-art--board_bg::before { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(6,18,24,.28), transparent 55%); content: ""; }
  .mm-board-preview { position: relative; display: grid; width: 100px; height: 72px; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 5px; border: 1px solid rgba(177, 227, 237, .28); background: rgba(7, 20, 27, .28); }
  .mm-board-cell { display: grid; place-items: center; border: 1px solid rgba(194, 231, 235, .16); background: rgba(229, 247, 249, .06); color: rgba(215, 246, 248, .9); font-size: 9px; font-weight: 800; }
  .mm-board-cell--active { border-color: rgba(115, 224, 231, .65); background: rgba(69, 181, 190, .34); }
  .mm-art--compact .mm-board-preview { width: 76px; height: 56px; gap: 3px; padding: 4px; }
  .mm-art--match_color { background: #172b34; }
  .mm-match-preview { position: relative; display: flex; align-items: center; gap: 7px; }
  .mm-match-preview span { display: block; width: 26px; height: 34px; border: 1px solid rgba(255,255,255,.25); background: linear-gradient(145deg, #263f49, #152830); }
  .mm-match-preview span:nth-child(2) { transform: translateY(4px); }
  .mm-match-preview i { position: absolute; top: 4px; left: 19px; width: 19px; height: 19px; border: 3px solid var(--item-color); border-radius: 50%; box-shadow: 0 0 0 3px rgba(15, 34, 41, .8); }
  .mm-art--compact .mm-match-preview span { width: 23px; height: 29px; }
  .mm-art--compact .mm-match-preview i { left: 16px; }
  .mm-art--avatar_frame { background: #172a34; }
  .mm-frame-avatar { display: grid; width: 53px; height: 53px; place-items: center; border: 3px solid var(--item-color); background: #28414b; color: #d9edf0; font-size: 12px; font-weight: 800; box-shadow: 0 0 0 4px rgba(221, 238, 241, .08), inset 0 0 0 1px rgba(255,255,255,.2); }
  .mm-art--compact .mm-frame-avatar { width: 43px; height: 43px; font-size: 10px; }
  .mm-art--title { background: #182b34; }
  .mm-title-preview { max-width: calc(100% - 18px); overflow: hidden; padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--item-color) 50%, transparent); background: rgba(8, 19, 24, .35); color: var(--item-color); font-size: 9px; font-weight: 900; letter-spacing: .08em; text-overflow: ellipsis; white-space: nowrap; }
  .mm-art--compact .mm-title-preview { padding: 6px 7px; font-size: 7px; }
  .mm-art--name_color { background: #172a34; }
  .mm-name-preview { color: var(--item-color); font-size: 17px; font-weight: 800; letter-spacing: -.04em; }
  .mm-art--compact .mm-name-preview { font-size: 14px; }
  .mm-closed-card { width: min(100%, 420px); margin: 14vh auto; padding: 30px; border: 1px solid #344a55; background: #182630; text-align: center; }
  .mm-closed-card .mm-brand-mark { display: grid; width: 54px; height: 54px; margin: 0 auto 16px; place-items: center; border: 1px solid #3e7384; background: #183c49; color: #80d5e8; font-weight: 900; }
  .mm-closed-card h1 { margin: 6px 0; color: #e4eef0; font-size: 23px; }
  .mm-closed-card > p:not(.mm-eyebrow) { color: #9aadb3; font-size: 12px; line-height: 1.5; }
  .mm-closed-card .mm-action { margin-top: 10px; }
  @media (max-width: 1050px) {
    .mm-shop-shell { padding: 16px; }
    .mm-shop-layout { grid-template-columns: 154px minmax(0, 1fr) 260px; gap: 10px; }
    .mm-shop-content { padding-right: 18px; padding-left: 18px; }
    .mm-equipped-list { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 5px; }
    .mm-equipped-strip { align-items: center; }
  }
  @media (max-width: 820px) {
    .mm-shop-layout { grid-template-columns: 1fr; }
    .mm-category-nav { display: flex; gap: 5px; overflow-x: auto; padding: 8px; }
    .mm-nav-heading, .mm-category-foot { display: none; }
    .mm-category-button { width: auto; min-width: max-content; min-height: 34px; padding: 0 9px; border-color: #2c424b; }
    .mm-category-button + .mm-category-button { margin-top: 0; }
    .mm-category-button.is-active::before { display: none; }
    .mm-category-button .mm-category-mark { width: auto; }
    .mm-detail-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 10px 14px; }
    .mm-detail-head { grid-column: 1 / -1; }
    .mm-detail-art-wrap { grid-row: span 3; height: auto; min-height: 170px; margin-top: 0; }
    .mm-detail-name-row, .mm-detail-description, .mm-effect-note, .mm-player-preview, .mm-detail-status, .mm-balance-warning, .mm-detail-action, .mm-no-surprises { grid-column: 2; }
    .mm-detail-name-row { margin-top: 0; }
    .mm-effect-note, .mm-player-preview { margin-top: 0; }
    .mm-detail-status { margin-top: 0; }
  }
  @media (max-width: 600px) {
    .mm-shop-shell { padding: 0; background: #101920; }
    .mm-profile-modal { border-right: 0; border-left: 0; }
    .mm-profile-head { display: grid; grid-template-columns: minmax(0, 1fr) 36px; align-items: center; gap: 12px; padding: 14px; }
    .mm-profile-identity { grid-column: 1; min-width: 0; }
    .mm-user-avatar { width: 45px; height: 45px; }
    .mm-user-copy h1 { font-size: 19px; }
    .mm-profile-subtitle { font-size: 9px; }
    .mm-balance { grid-column: 1 / -1; min-width: 0; padding: 8px; }
    .mm-balance-note { display: none; }
    .mm-close { grid-column: 2; grid-row: 1; margin: 0; }
    .mm-profile-context { padding: 0 14px; }
    .mm-context-count { font-size: 8px; }
    .mm-shop-content { padding: 20px 13px 16px; }
    .mm-shop-heading h2 { font-size: 25px; }
    .mm-shop-mark { width: 44px; height: 44px; }
    .mm-heading-copy { max-width: 270px; font-size: 10px; line-height: 1.45; }
    .mm-equipped-strip { display: block; padding: 9px; }
    .mm-equipped-title { width: auto; margin-bottom: 7px; }
    .mm-equipped-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mm-equipped-chip { padding: 4px; }
    .mm-chip-copy small { font-size: 7px; }
    .mm-chip-copy strong { font-size: 8px; }
    .mm-browse-toolbar { flex-wrap: wrap; gap: 10px; margin-top: 17px; }
    .mm-browse-label { min-width: 0; width: 100%; }
    .mm-search { flex: 1 1 100%; order: 2; }
    .mm-owned-toggle { order: 3; }
    .mm-result-count { order: 4; margin-left: auto; }
    .mm-shop-layout { gap: 9px; }
    .mm-category-nav { margin: 0 -13px; border-right: 0; border-left: 0; }
    .mm-catalog-heading { min-height: 42px; }
    .mm-catalog-heading h3 { font-size: 14px; }
    .mm-catalog-hint { max-width: 120px; font-size: 7px; }
    .mm-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
    .mm-product { padding: 8px; }
    .mm-product-preview-button { height: 73px; }
    .mm-product-copy h4 { font-size: 10px; }
    .mm-product-copy p { font-size: 8px; }
    .mm-product-actions { gap: 3px; }
    .mm-details-button { min-width: 53px; font-size: 7px; }
    .mm-action { padding: 0 5px; font-size: 8px; }
    .mm-detail-panel { display: block; padding: 11px; }
    .mm-detail-art-wrap { min-height: 130px; margin-top: 10px; }
    .mm-detail-name-row { margin-top: 10px; }
    .mm-effect-note { margin-top: 10px; }
    .mm-player-preview { margin-top: 10px; }
    .mm-detail-status { margin-top: 10px; }
    .mm-detail-action { margin-top: 8px; }
    .mm-modal-footer { align-items: flex-start; flex-direction: column; justify-content: center; gap: 4px; min-height: 50px; padding: 8px 13px; font-size: 7px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mm-shop-shell *, .mm-shop-shell *::before, .mm-shop-shell *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
`;
