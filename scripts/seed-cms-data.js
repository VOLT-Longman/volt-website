const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('data/volt-data.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const data = context.window.VOLT_DATA || {};
const now = new Date().toISOString();

function quote(value) { return String(value ?? '').replace(/'/g, "''"); }
function insert(table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column] === null ? 'NULL' : "'" + quote(row[column]) + "'");
  return 'INSERT OR IGNORE INTO ' + table + ' (' + columns.join(', ') + ') VALUES (' + values.join(', ') + ');';
}

const statements = [];
(data.announcements || []).forEach((item) => statements.push(insert('notices', { id: item.id, title: item.title, content: item.content, tag: item.tag || '공지', pinned: item.pinned ? 1 : 0, published: 1, date: item.date || now.slice(0, 10), created_at: now, updated_at: now })));
(data.calendar || []).forEach((item) => statements.push(insert('events', { id: item.id, title: item.title, description: item.description || '', type: item.type || '작전', status: item.status || '예정', date_label: item.dateLabel || item.date || '', event_date: item.eventDate || '', published: 1, created_at: now, updated_at: now })));
(data.gallery || []).forEach((item, index) => statements.push(insert('gallery_items', { id: item.id, title: item.title, description: item.description || '', category: item.category || '활동', image_url: item.src, thumb_url: item.thumb || item.src, date: item.date || '', sort_order: index, published: 1, created_at: now, updated_at: now })));
fs.mkdirSync('migrations', { recursive: true });
fs.writeFileSync('migrations/0002_seed_content.sql', statements.join('\n') + '\n', 'utf8');
console.log('Wrote ' + statements.length + ' seed statements to migrations/0002_seed_content.sql');
