#!/usr/bin/env node
/**
 * VOLT Orbit Display v3 — 애플 계열 라운드 지오메트리 디스플레이 서체 생성기.
 *
 * v2(Python+fontTools, 직선 beam 전용)와 달리 외부 의존성 없이 Node 표준
 * 라이브러리만으로 TTF와 WOFF2(널 변환)를 직접 인코딩한다. 프로덕션은 생성된
 * 파일만 서빙하며, 아웃라인 변경 시에만 이 스크립트를 재실행한다.
 *
 * 디자인 원칙: 라운드 캡 스트로크 + 진원 보울(오버슈트 포함), 절제된 기하학.
 * 커버리지: 라틴 대문자·숫자·핵심 기호 — 한글은 의도적으로 폴백 스택 사용.
 *
 * 실행: node scripts/font/generate-volt-orbit-v3.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'assets', 'fonts');

// ===== 메트릭 =====
const UPM = 1000;
const CAP = 720;            // 대문자 높이
const OVERSHOOT = 14;       // 원형 상하 오버슈트 (시각 보정)
const ASCENDER = 780;
const DESCENDER = -200;
const STROKE = 92;          // 기본 획 두께
const SIDE = 60;            // 기본 사이드베어링
const DEG = Math.PI / 180;

// ===== 아웃라인 프리미티브 =====
// 점: { x, y, on } — TTF 쿼드라틱. 원호는 45° 이하 세그먼트로 근사(오차 < 0.2유닛).

function arcPoints(cx, cy, r, a0deg, a1deg) {
  // a0→a1 방향으로 진행하는 원호 점열 (시작점 제외, 끝점 포함)
  const points = [];
  const total = a1deg - a0deg;
  const steps = Math.max(1, Math.ceil(Math.abs(total) / 45));
  const step = total / steps;
  for (let i = 0; i < steps; i++) {
    const s = (a0deg + step * i) * DEG;
    const e = (a0deg + step * (i + 1)) * DEG;
    const m = (s + e) / 2;
    const rc = r / Math.cos((step / 2) * DEG);
    points.push({ x: cx + Math.cos(m) * rc, y: cy + Math.sin(m) * rc, on: false });
    points.push({ x: cx + Math.cos(e) * r, y: cy + Math.sin(e) * r, on: true });
  }
  return points;
}

function circleContour(cx, cy, r, clockwise) {
  // TTF(논제로): 바깥 윤곽과 구멍은 서로 반대 방향이어야 한다.
  const start = { x: cx + r, y: cy, on: true };
  const sweep = clockwise ? -360 : 360;
  return [start, ...arcPoints(cx, cy, r, 0, sweep).slice(0, -1)];
}

// 라운드 캡 스트로크(스타디움) — 모든 직선 획의 기본형
function roundBeam(x1, y1, x2, y2, width = STROKE) {
  const w = width / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1) / DEG;
  const nx = Math.cos((angle + 90) * DEG) * w;
  const ny = Math.sin((angle + 90) * DEG) * w;
  const contour = [];
  contour.push({ x: x1 + nx, y: y1 + ny, on: true });
  contour.push({ x: x2 + nx, y: y2 + ny, on: true });
  contour.push(...arcPoints(x2, y2, w, angle + 90, angle - 90)); // 끝 캡
  contour.push({ x: x1 - nx, y: y1 - ny, on: true });
  contour.push(...arcPoints(x1, y1, w, angle - 90, angle - 270).slice(0, -1)); // 시작 캡
  return [contour];
}

// 라운드 캡 원호 스트로크 — C/G/S/U/2/3/5/6/9 등의 곡선 획
function arcStroke(cx, cy, r, a0, a1, width = STROKE) {
  const w = width / 2;
  const contour = [];
  contour.push({ x: cx + Math.cos(a0 * DEG) * (r + w), y: cy + Math.sin(a0 * DEG) * (r + w), on: true });
  contour.push(...arcPoints(cx, cy, r + w, a0, a1));                 // 바깥 원호
  contour.push(...arcPoints(
    cx + Math.cos(a1 * DEG) * r, cy + Math.sin(a1 * DEG) * r, w,
    a1, a1 + 180));                                                   // 끝 캡
  contour.push(...arcPoints(cx, cy, r - w, a1, a0));                 // 안쪽 원호(역방향)
  contour.push(...arcPoints(
    cx + Math.cos(a0 * DEG) * r, cy + Math.sin(a0 * DEG) * r, w,
    a0 + 180, a0 + 360).slice(0, -1));                                // 시작 캡
  return [contour];
}

function ring(cx, cy, rOuter, width = STROKE) {
  return [circleContour(cx, cy, rOuter, false), circleContour(cx, cy, rOuter - width, true)];
}

function dot(cx, cy, r = STROKE * 0.56) {
  return [circleContour(cx, cy, r, false)];
}

// ===== 글리프 정의 =====
// 각 글리프: { adv, parts: [contour...] } — 좌표는 사이드베어링 포함 절대값.

const MID = CAP / 2;
function stdWidth(w) { return w + SIDE * 2; }

function letterO(width = 600) {
  const r = (CAP + OVERSHOOT * 2) / 2;
  const cx = width / 2;
  return { adv: width, parts: ring(cx, MID, r) };
}

function buildGlyphs() {
  const glyphs = {};
  const L = SIDE;                // 표준 좌측 스템 위치
  const bowlR = (CAP + OVERSHOOT * 2) / 2;

  const B = (...args) => roundBeam(...args);
  const A = (...args) => arcStroke(...args);

  // --- 대문자 ---
  glyphs.A = { adv: stdWidth(560), parts: [
    ...B(SIDE + 26, 0, SIDE + 280, CAP), ...B(SIDE + 280, CAP, SIDE + 534, 0), ...B(SIDE + 128, 232, SIDE + 432, 232)] };
  glyphs.B = { adv: stdWidth(500), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 250, CAP), ...B(L, MID, L + 250, MID), ...B(L, 0, L + 250, 0),
    ...A(L + 250, CAP - 180, 180, -90, 90), ...A(L + 250, 180, 180, -90, 90)] };
  glyphs.C = { adv: stdWidth(560), parts: A(SIDE + 280, MID, bowlR - STROKE / 2, 38, 322) };
  glyphs.D = { adv: stdWidth(540), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 220, CAP), ...B(L, 0, L + 220, 0),
    ...A(L + 220, MID, MID + OVERSHOOT - STROKE / 2, -90, 90)] };
  glyphs.E = { adv: stdWidth(460), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 400, CAP), ...B(L, MID, L + 360, MID), ...B(L, 0, L + 400, 0)] };
  glyphs.F = { adv: stdWidth(440), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 380, CAP), ...B(L, MID, L + 340, MID)] };
  glyphs.G = { adv: stdWidth(560), parts: [
    ...A(SIDE + 280, MID, bowlR - STROKE / 2, 38, 322),
    ...B(SIDE + 300, 300, SIDE + 520, 300), ...B(SIDE + 520, 300, SIDE + 520, 60)] };
  glyphs.H = { adv: stdWidth(500), parts: [
    ...B(L, 0, L, CAP), ...B(L + 440, 0, L + 440, CAP), ...B(L, MID, L + 440, MID)] };
  glyphs.I = { adv: stdWidth(92), parts: B(L + 46, 0, L + 46, CAP) };
  glyphs.J = { adv: stdWidth(420), parts: [
    ...B(L + 360, CAP, L + 360, 190), ...A(L + 190, 190, 170, 0, -180)] };
  glyphs.K = { adv: stdWidth(500), parts: [
    ...B(L, 0, L, CAP), ...B(L, 300, L + 440, CAP), ...B(L + 132, 402, L + 452, 0)] };
  glyphs.L = { adv: stdWidth(420), parts: [...B(L, 0, L, CAP), ...B(L, 0, L + 360, 0)] };
  glyphs.M = { adv: stdWidth(640), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 288, 210), ...B(L + 288, 210, L + 576, CAP), ...B(L + 576, 0, L + 576, CAP)] };
  glyphs.N = { adv: stdWidth(520), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 460, 0), ...B(L + 460, 0, L + 460, CAP)] };
  glyphs.O = letterO(stdWidth(CAP + OVERSHOOT * 2));
  glyphs.P = { adv: stdWidth(500), parts: [
    ...B(L, 0, L, CAP), ...B(L, CAP, L + 240, CAP), ...B(L, 332, L + 240, 332),
    ...A(L + 240, (CAP + 332) / 2, (CAP - 332) / 2, -90, 90)] };
  glyphs.Q = { adv: glyphs.O.adv, parts: [
    ...letterO(glyphs.O.adv).parts, ...B(glyphs.O.adv / 2 + 70, 150, glyphs.O.adv / 2 + 250, -40)] };
  glyphs.R = { adv: stdWidth(520), parts: [
    ...glyphs.P.parts.map((c) => c.map((p) => ({ ...p }))), ...B(L + 210, 332, L + 460, 0)] };
  glyphs.S = { adv: stdWidth(500), parts: [
    ...A(SIDE + 250, CAP - 186, 186 - STROKE / 2 + OVERSHOOT, 22, 262),
    ...A(SIDE + 250, 186, 186 - STROKE / 2 + OVERSHOOT, -158, 82)] };
  glyphs.T = { adv: stdWidth(520), parts: [
    ...B(L, CAP, L + 460, CAP), ...B(L + 230, 0, L + 230, CAP)] };
  glyphs.U = { adv: stdWidth(520), parts: [
    ...B(L, CAP, L, 230), ...B(L + 460, CAP, L + 460, 230), ...A(L + 230, 230, 230, 180, 360)] };
  glyphs.V = { adv: stdWidth(560), parts: [
    ...B(SIDE + 26, CAP, SIDE + 280, 0), ...B(SIDE + 280, 0, SIDE + 534, CAP)] };
  glyphs.W = { adv: stdWidth(760), parts: [
    ...B(SIDE + 20, CAP, SIDE + 200, 0), ...B(SIDE + 200, 0, SIDE + 380, CAP - 210),
    ...B(SIDE + 380, CAP - 210, SIDE + 560, 0), ...B(SIDE + 560, 0, SIDE + 740, CAP)] };
  glyphs.X = { adv: stdWidth(540), parts: [
    ...B(SIDE + 16, 0, SIDE + 524, CAP), ...B(SIDE + 16, CAP, SIDE + 524, 0)] };
  glyphs.Y = { adv: stdWidth(560), parts: [
    ...B(SIDE + 20, CAP, SIDE + 280, 330), ...B(SIDE + 540, CAP, SIDE + 280, 330), ...B(SIDE + 280, 330, SIDE + 280, 0)] };
  glyphs.Z = { adv: stdWidth(500), parts: [
    ...B(L + 10, CAP, L + 430, CAP), ...B(L + 430, CAP, L + 10, 0), ...B(L + 10, 0, L + 430, 0)] };

  // --- 숫자 ---
  const numO = letterO(stdWidth(540));
  glyphs['0'] = numO;
  glyphs['1'] = { adv: stdWidth(300), parts: [
    ...B(L + 190, 0, L + 190, CAP), ...B(L + 30, CAP - 160, L + 190, CAP)] };
  glyphs['2'] = { adv: stdWidth(500), parts: [
    ...A(SIDE + 250, CAP - 190, 190 - STROKE / 2 + OVERSHOOT, 150, -20),
    ...B(SIDE + 250 + Math.cos(-20 * DEG) * 152, CAP - 190 + Math.sin(-20 * DEG) * 152, L + 16, 0),
    ...B(L + 16, 0, L + 440, 0)] };
  glyphs['3'] = { adv: stdWidth(500), parts: [
    ...A(SIDE + 224, CAP - 186, 186 - STROKE / 2 + OVERSHOOT, 150, -85),
    ...A(SIDE + 224, 186, 186 - STROKE / 2 + OVERSHOOT, 85, -150)] };
  glyphs['4'] = { adv: stdWidth(540), parts: [
    ...B(L + 350, 0, L + 350, CAP), ...B(L + 350, CAP, L + 10, 220), ...B(L + 10, 220, L + 480, 220)] };
  glyphs['5'] = { adv: stdWidth(500), parts: [
    ...B(L + 70, CAP, L + 420, CAP), ...B(L + 70, CAP, L + 58, 442),
    ...A(SIDE + 234, 236, 236 - STROKE / 2 + OVERSHOOT, 148, -148)] };
  glyphs['6'] = { adv: stdWidth(520), parts: [
    ...ring(SIDE + 260, 212, 212 + OVERSHOOT), ...A(SIDE + 260, 212, 212 + OVERSHOOT - STROKE / 2, 96, 200),
    ...B(SIDE + 260 + Math.cos(200 * DEG) * 168, 212 + Math.sin(200 * DEG) * 168 + 250, SIDE + 150, CAP - 40)].slice(0) };
  glyphs['7'] = { adv: stdWidth(500), parts: [
    ...B(L + 10, CAP, L + 440, CAP), ...B(L + 440, CAP, L + 150, 0)] };
  glyphs['8'] = { adv: stdWidth(520), parts: [
    ...ring(SIDE + 260, CAP - 178, 178 + OVERSHOOT / 2), ...ring(SIDE + 260, 196, 196 + OVERSHOOT / 2)] };
  glyphs['9'] = { adv: stdWidth(520), parts: [
    ...ring(SIDE + 260, CAP - 212, 212 + OVERSHOOT),
    ...B(SIDE + 382, CAP - 330, SIDE + 200, 0)] };

  // 6은 실험 조합이 과했다 — 링 + 위로 뻗는 목으로 단순화(재정의)
  glyphs['6'] = { adv: stdWidth(520), parts: [
    ...ring(SIDE + 260, 212, 212 + OVERSHOOT),
    ...B(SIDE + 138, 330, SIDE + 320, CAP)] };

  // --- 기호 ---
  glyphs[' '] = { adv: 240, parts: [] };
  glyphs['.'] = { adv: stdWidth(104), parts: dot(SIDE + 52, 52) };
  glyphs[','] = { adv: stdWidth(104), parts: [...dot(SIDE + 52, 62), ...B(SIDE + 62, 30, SIDE + 22, -96, 70)] };
  glyphs['-'] = { adv: stdWidth(320), parts: B(L + 20, MID, L + 300, MID) };
  glyphs['/'] = { adv: stdWidth(380), parts: B(L + 10, -40, L + 370, CAP + 20) };
  glyphs['+'] = { adv: stdWidth(400), parts: [
    ...B(L + 20, MID, L + 380, MID), ...B(L + 200, MID - 180, L + 200, MID + 180)] };
  glyphs[':'] = { adv: stdWidth(104), parts: [...dot(SIDE + 52, 120), ...dot(SIDE + 52, CAP - 200)] };
  glyphs['·'] = { adv: stdWidth(104), parts: dot(SIDE + 52, MID) };
  glyphs['→'] = { adv: stdWidth(560), parts: [
    ...B(L + 10, MID, L + 500, MID), ...B(L + 320, MID + 176, L + 500, MID), ...B(L + 320, MID - 176, L + 500, MID)] };
  glyphs['&'] = { adv: stdWidth(560), parts: [
    ...ring(SIDE + 214, CAP - 166, 150), ...ring(SIDE + 214, 178, 178 + OVERSHOOT / 2),
    ...B(SIDE + 300, 300, SIDE + 520, 20)] };
  glyphs['%'] = { adv: stdWidth(620), parts: [
    ...ring(SIDE + 130, CAP - 128, 118, 84), ...ring(SIDE + 490, 128, 118, 84), ...B(SIDE + 60, 0, SIDE + 560, CAP)] };

  return glyphs;
}

// ===== TTF 인코딩 =====
function toFontUnits(glyphs) {
  const order = ['.notdef', ...Object.keys(glyphs)];
  const encoded = new Map();
  encoded.set('.notdef', { adv: 500, contours: [] });
  for (const [ch, g] of Object.entries(glyphs)) {
    const contours = g.parts.map((contour) => contour.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on })));
    encoded.set(ch, { adv: Math.round(g.adv), contours });
  }
  return { order, encoded };
}

function glyphBBox(contours) {
  let xMin = 0, yMin = 0, xMax = 0, yMax = 0, first = true;
  for (const contour of contours) for (const p of contour) {
    if (first) { xMin = xMax = p.x; yMin = yMax = p.y; first = false; continue; }
    xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
  }
  return { xMin, yMin, xMax, yMax };
}

function encodeGlyf(contours) {
  if (!contours.length) return Buffer.alloc(0);
  const bbox = glyphBBox(contours);
  const endPts = []; const flags = []; const xs = []; const ys = [];
  let pointIndex = -1;
  for (const contour of contours) {
    for (const p of contour) { flags.push(p.on ? 1 : 0); xs.push(p.x); ys.push(p.y); pointIndex++; }
    endPts.push(pointIndex);
  }
  const header = Buffer.alloc(10);
  header.writeInt16BE(contours.length, 0);
  header.writeInt16BE(bbox.xMin, 2); header.writeInt16BE(bbox.yMin, 4);
  header.writeInt16BE(bbox.xMax, 6); header.writeInt16BE(bbox.yMax, 8);
  const endBuf = Buffer.alloc(endPts.length * 2 + 2);
  endPts.forEach((v, i) => { endBuf.writeUInt16BE(v, i * 2); });
  endBuf.writeUInt16BE(0, endPts.length * 2); // instructionLength = 0
  // 좌표 델타 인코딩 (압축 플래그는 단순화를 위해 미사용 — x/y 모두 int16)
  const n = flags.length;
  const flagBuf = Buffer.alloc(n);
  for (let i = 0; i < n; i++) flagBuf[i] = flags[i]; // bit0 = onCurve
  const xBuf = Buffer.alloc(n * 2); const yBuf = Buffer.alloc(n * 2);
  let prevX = 0, prevY = 0;
  for (let i = 0; i < n; i++) {
    xBuf.writeInt16BE(xs[i] - prevX, i * 2); prevX = xs[i];
    yBuf.writeInt16BE(ys[i] - prevY, i * 2); prevY = ys[i];
  }
  let glyph = Buffer.concat([header, endBuf, flagBuf, xBuf, yBuf]);
  if (glyph.length % 4) glyph = Buffer.concat([glyph, Buffer.alloc(4 - (glyph.length % 4))]);
  return glyph;
}

function buildTables(order, encoded) {
  // glyf + loca
  const glyfParts = []; const locas = [0];
  let offset = 0;
  const bboxAll = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  let maxPoints = 0, maxContours = 0;
  for (const key of order) {
    const g = encoded.get(key);
    const buf = encodeGlyf(g.contours);
    glyfParts.push(buf); offset += buf.length; locas.push(offset);
    if (g.contours.length) {
      const bb = glyphBBox(g.contours);
      bboxAll.xMin = Math.min(bboxAll.xMin, bb.xMin); bboxAll.yMin = Math.min(bboxAll.yMin, bb.yMin);
      bboxAll.xMax = Math.max(bboxAll.xMax, bb.xMax); bboxAll.yMax = Math.max(bboxAll.yMax, bb.yMax);
      maxPoints = Math.max(maxPoints, g.contours.reduce((s, c) => s + c.length, 0));
      maxContours = Math.max(maxContours, g.contours.length);
    }
  }
  const glyf = Buffer.concat(glyfParts);
  const loca = Buffer.alloc(locas.length * 4);
  locas.forEach((v, i) => { loca.writeUInt32BE(v, i * 4); });

  // hmtx
  const hmtx = Buffer.alloc(order.length * 4);
  order.forEach((key, i) => {
    hmtx.writeUInt16BE(encoded.get(key).adv, i * 4);
    const g = encoded.get(key);
    hmtx.writeInt16BE(g.contours.length ? glyphBBox(g.contours).xMin : 0, i * 4 + 2);
  });

  // cmap format 4
  const mapping = [];
  order.forEach((key, gid) => { if (key !== '.notdef') mapping.push([key.codePointAt(0), gid]); });
  mapping.sort((a, b) => a[0] - b[0]);
  const segments = [];
  for (const [code, gid] of mapping) {
    const last = segments[segments.length - 1];
    if (last && code === last.end + 1 && gid === last.startGid + (last.end - last.start) + 1) last.end = code;
    else segments.push({ start: code, end: code, startGid: gid });
  }
  segments.push({ start: 0xFFFF, end: 0xFFFF, startGid: 0, final: true });
  const segCount = segments.length;
  const cmapSub = Buffer.alloc(16 + segCount * 8);
  cmapSub.writeUInt16BE(4, 0);
  cmapSub.writeUInt16BE(cmapSub.length, 2);
  const segCountX2 = segCount * 2;
  const searchRange = 2 * (2 ** Math.floor(Math.log2(segCount)));
  cmapSub.writeUInt16BE(segCountX2, 6);
  cmapSub.writeUInt16BE(searchRange, 8);
  cmapSub.writeUInt16BE(Math.floor(Math.log2(segCount)), 10);
  cmapSub.writeUInt16BE(segCountX2 - searchRange, 12);
  let p = 14;
  for (const s of segments) { cmapSub.writeUInt16BE(s.end, p); p += 2; }
  p += 2; // reservedPad
  for (const s of segments) { cmapSub.writeUInt16BE(s.start, p); p += 2; }
  for (const s of segments) {
    const delta = s.final ? 1 : (s.startGid - s.start);
    cmapSub.writeInt16BE(((delta % 65536) + 65536) % 65536 > 32767
      ? ((delta % 65536) + 65536) % 65536 - 65536
      : ((delta % 65536) + 65536) % 65536, p);
    p += 2;
  }
  for (let i = 0; i < segCount; i++) { cmapSub.writeUInt16BE(0, p); p += 2; } // idRangeOffset
  const cmap = Buffer.concat([
    (() => { const b = Buffer.alloc(12); b.writeUInt16BE(0, 0); b.writeUInt16BE(1, 2); b.writeUInt16BE(3, 4); b.writeUInt16BE(1, 6); b.writeUInt32BE(12, 8); return b; })(),
    cmapSub
  ]);

  // head
  const head = Buffer.alloc(54);
  head.writeUInt32BE(0x00010000, 0);           // version
  head.writeUInt32BE(0x00030000, 4);           // fontRevision 3.0
  head.writeUInt32BE(0, 8);                    // checkSumAdjustment (후기입)
  head.writeUInt32BE(0x5F0F3CF5, 12);          // magic
  head.writeUInt16BE(0b0000000000001011, 16);  // flags
  head.writeUInt16BE(UPM, 18);
  head.writeInt16BE(bboxAll.xMin, 36); head.writeInt16BE(bboxAll.yMin, 38);
  head.writeInt16BE(bboxAll.xMax, 40); head.writeInt16BE(bboxAll.yMax, 42);
  head.writeUInt16BE(0, 44);                   // macStyle
  head.writeUInt16BE(8, 46);                   // lowestRecPPEM
  head.writeInt16BE(2, 48);                    // fontDirectionHint
  head.writeInt16BE(1, 50);                    // indexToLocFormat = long
  head.writeInt16BE(0, 52);

  // hhea
  const hhea = Buffer.alloc(36);
  hhea.writeUInt32BE(0x00010000, 0);
  hhea.writeInt16BE(ASCENDER, 4);
  hhea.writeInt16BE(DESCENDER, 6);
  hhea.writeInt16BE(90, 8);                    // lineGap
  hhea.writeUInt16BE(Math.max(...order.map((k) => encoded.get(k).adv)), 10);
  hhea.writeInt16BE(0, 12); hhea.writeInt16BE(0, 14); hhea.writeInt16BE(0, 16);
  hhea.writeInt16BE(1, 18); // caretSlopeRise
  hhea.writeUInt16BE(order.length, 34);

  // maxp
  const maxp = Buffer.alloc(32);
  maxp.writeUInt32BE(0x00010000, 0);
  maxp.writeUInt16BE(order.length, 4);
  maxp.writeUInt16BE(maxPoints, 6);
  maxp.writeUInt16BE(maxContours, 8);
  maxp.writeUInt16BE(2, 14); // maxZones

  // OS/2 v4
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(4, 0);
  os2.writeInt16BE(520, 2);                    // xAvgCharWidth
  os2.writeUInt16BE(600, 4);                   // usWeightClass — SemiBold 톤
  os2.writeUInt16BE(5, 6);                     // usWidthClass
  os2.writeUInt16BE(0, 8);
  Buffer.from('VOLT').copy(os2, 58);           // achVendID
  os2.writeUInt16BE(0b0000000011000000, 62);   // fsSelection: REGULAR|USE_TYPO_METRICS
  const codes = mapping.map(([c]) => c);
  os2.writeUInt16BE(Math.min(...codes), 64);
  os2.writeUInt16BE(Math.max(...codes) > 0xFFFF ? 0xFFFF : Math.max(...codes), 66);
  os2.writeInt16BE(ASCENDER, 68); os2.writeInt16BE(DESCENDER, 70); os2.writeInt16BE(90, 72);
  os2.writeUInt16BE(ASCENDER, 74); os2.writeUInt16BE(-DESCENDER, 76);
  os2.writeUInt32BE(1, 78);                    // ulCodePageRange1 — Latin1
  os2.writeInt16BE(380, 86);                   // sxHeight(참고값)
  os2.writeInt16BE(CAP, 88);                   // sCapHeight

  // name / post
  const nameStrings = [
    [1, 'VOLT Orbit Display'], [2, 'Regular'], [3, 'VOLT Orbit Display v3.000'],
    [4, 'VOLT Orbit Display'], [5, 'Version 3.000'], [6, 'VOLTOrbitDisplay-Regular'],
    [0, 'Copyright 2026 VOLT Fleet.']
  ].sort((a, b) => a[0] - b[0]);
  const nameRecords = []; const nameData = [];
  let nameOffset = 0;
  for (const [id, value] of nameStrings) {
    const buf = Buffer.from(value, 'utf16le').swap16();
    nameRecords.push({ platform: 3, encoding: 1, lang: 0x409, id, length: buf.length, offset: nameOffset });
    nameData.push(buf); nameOffset += buf.length;
  }
  const name = Buffer.alloc(6 + nameRecords.length * 12 + nameOffset);
  name.writeUInt16BE(0, 0); name.writeUInt16BE(nameRecords.length, 2);
  name.writeUInt16BE(6 + nameRecords.length * 12, 4);
  nameRecords.forEach((r, i) => {
    const at = 6 + i * 12;
    name.writeUInt16BE(r.platform, at); name.writeUInt16BE(r.encoding, at + 2);
    name.writeUInt16BE(r.lang, at + 4); name.writeUInt16BE(r.id, at + 6);
    name.writeUInt16BE(r.length, at + 8); name.writeUInt16BE(r.offset, at + 10);
  });
  Buffer.concat(nameData).copy(name, 6 + nameRecords.length * 12);

  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  return { head, hhea, maxp, 'OS/2': os2, hmtx, cmap, loca, glyf, name, post };
}

function checksum(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    sum = (sum + buffer.readUInt32BE(i)) >>> 0;
  }
  return sum >>> 0;
}

function buildTtf(tables) {
  const tags = Object.keys(tables).sort();
  const numTables = tags.length;
  const searchRange = 16 * (2 ** Math.floor(Math.log2(numTables)));
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(Math.floor(Math.log2(numTables)), 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = header.length;
  const padded = new Map();
  for (const tag of tags) {
    let data = tables[tag];
    if (data.length % 4) data = Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
    padded.set(tag, data);
  }
  tags.forEach((tag, i) => {
    const data = padded.get(tag);
    const at = 12 + i * 16;
    header.write(tag.padEnd(4), at, 'latin1');
    header.writeUInt32BE(checksum(data), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(tables[tag].length, at + 12);
    offset += data.length;
  });
  const font = Buffer.concat([header, ...tags.map((t) => padded.get(t))]);
  const adjustment = (0xB1B0AFBA - checksum(font)) >>> 0;
  const headIndex = 12 + tags.indexOf('head') * 16;
  const headOffset = font.readUInt32BE(headIndex + 8);
  font.writeUInt32BE(adjustment, headOffset + 8);
  return font;
}

// ===== WOFF2 (널 변환 — glyf/loca 원본 그대로, brotli 압축) =====
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];

function uintBase128(value) {
  const bytes = [];
  do { bytes.unshift(value & 0x7F); value = Math.floor(value / 128); } while (value > 0);
  for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
  return Buffer.from(bytes);
}

function buildWoff2(tables, ttfLength) {
  const tags = Object.keys(tables).sort();
  const directory = []; const dataParts = [];
  for (const tag of tags) {
    const data = tables[tag];
    const known = KNOWN_TAGS.indexOf(tag);
    // glyf/loca는 널 변환(transform version 3) — flags 상위 2비트 = 3
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const flagByte = (known === -1 ? 0x3F : known) | (isGlyfLoca ? 0xC0 : 0x00);
    const parts = [Buffer.from([flagByte])];
    if (known === -1) parts.push(Buffer.from(tag.padEnd(4), 'latin1'));
    parts.push(uintBase128(data.length));
    // 널 변환(transformVersion 3)에서는 transformLength 필드를 기록하지 않는다 — 스펙 위반 시 OTS가 거부
    directory.push(Buffer.concat(parts));
    dataParts.push(data);
  }
  const raw = Buffer.concat(dataParts);
  const compressed = brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } });
  const dirBuf = Buffer.concat(directory);
  const headerSize = 48;
  let total = headerSize + dirBuf.length + compressed.length;
  const pad = total % 4 ? 4 - (total % 4) : 0;
  total += pad;
  const header = Buffer.alloc(headerSize);
  header.write('wOF2', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);          // flavor = TrueType
  header.writeUInt32BE(total, 8);
  header.writeUInt16BE(tags.length, 12);
  header.writeUInt32BE(ttfLength, 16);          // totalSfntSize
  header.writeUInt32BE(compressed.length, 20);  // totalCompressedSize
  header.writeUInt16BE(3, 24);                  // majorVersion
  return Buffer.concat([header, dirBuf, compressed, Buffer.alloc(pad)]);
}

// ===== 실행 =====
const glyphSource = buildGlyphs();
const { order, encoded } = toFontUnits(glyphSource);
const tables = buildTables(order, encoded);
// 패딩 전 원본 테이블로 sfnt 크기 계산
const ttf = buildTtf(tables);
const woff2 = buildWoff2(Object.fromEntries(Object.entries(tables).map(([k, v]) => {
  return [k, v.length % 4 ? Buffer.concat([v, Buffer.alloc(4 - (v.length % 4))]) : v];
})), ttf.length);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'VOLT-Orbit-Display.ttf'), ttf);
writeFileSync(path.join(OUT_DIR, 'VOLT-Orbit-Display.woff2'), woff2);
console.log(`TTF ${ttf.length}B / WOFF2 ${woff2.length}B / 글리프 ${order.length}개 (${order.slice(1).join('')})`);
