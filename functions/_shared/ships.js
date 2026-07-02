// isolate당 1회만 DDL 실행 — 매 요청 CREATE TABLE/INDEX는 동시 접속 시
// D1 쓰기 락 경합(간헐 저장 실패)의 원인이 된다. 테이블은 migrations로도 보장됨.
let shipOverridesEnsured = false;

export async function ensureShipOverridesTable(db) {
  if (shipOverridesEnsured) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ship_overrides (
    id TEXT PRIMARY KEY,
    ship_id TEXT NOT NULL UNIQUE,
    name TEXT,
    manufacturer TEXT,
    role TEXT,
    focus TEXT,
    size TEXT,
    crew TEXT,
    cargo TEXT,
    price_usd INTEGER,
    implemented INTEGER,
    planner_eligible INTEGER,
    tags TEXT,
    description TEXT,
    updated_at TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ship_overrides_ship_id ON ship_overrides (ship_id)').run();
  shipOverridesEnsured = true;
}
