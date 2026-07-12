// isolate당 1회만 DDL 실행 — 매 요청 CREATE TABLE/INDEX는 동시 접속 시
// D1 쓰기 락 경합(간헐 저장 실패)의 원인이 된다. 테이블은 migrations로도 보장됨.
let shipOverridesEnsured = false;

export async function ensureShipOverridesTable(db) {
  if (shipOverridesEnsured) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ship_overrides (
    id TEXT PRIMARY KEY,
    ship_id TEXT NOT NULL UNIQUE,
    name TEXT,
    name_ko TEXT,
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
    hidden INTEGER,
    updated_at TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ship_overrides_ship_id ON ship_overrides (ship_id)').run();
  // 기존(0003) 테이블에 0010 컬럼이 없을 수 있어 보강한다. 이미 있으면 실패를 무시.
  await addColumnIfMissing(db, 'name_ko TEXT');
  await addColumnIfMissing(db, 'hidden INTEGER');
  shipOverridesEnsured = true;
}

async function addColumnIfMissing(db, columnDef) {
  try {
    await db.prepare(`ALTER TABLE ship_overrides ADD COLUMN ${columnDef}`).run();
  } catch (caught) {
    if (!isDuplicateColumnError(caught)) throw caught;
  }
}

function isDuplicateColumnError(error) {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}
