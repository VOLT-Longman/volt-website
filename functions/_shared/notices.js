// D-3: notices.title_en/content_en/tag_en(0008)에 대한 런타임 DDL 방어.
// ship_overrides(0010)는 ensureShipOverridesTable의 ALTER-and-ignore-duplicate 패턴으로
// 이미 방어되지만, notices는 0008 미적용 D1에서 INSERT/UPDATE가 무조건 이 컬럼을 참조해
// "no such column" 500으로 죽는다(leadership/partner-fleets만 tableHasColumn 폴백이 있었음).
// isolate당 1회만 시도 — 매 요청 ALTER는 D1 쓰기 락 경합의 원인이 된다(ships.js와 동일 이유).
let noticesEnColumnsEnsured = false;

export async function ensureNoticesEnColumns(db) {
  if (noticesEnColumnsEnsured) return;
  for (const column of ['title_en', 'content_en', 'tag_en']) {
    await addColumnIfMissing(db, column);
  }
  noticesEnColumnsEnsured = true;
}

async function addColumnIfMissing(db, columnName) {
  try {
    await db.prepare(`ALTER TABLE notices ADD COLUMN ${columnName} TEXT`).run();
  } catch (caught) {
    if (!isDuplicateColumnError(caught)) throw caught;
  }
}

function isDuplicateColumnError(error) {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}
