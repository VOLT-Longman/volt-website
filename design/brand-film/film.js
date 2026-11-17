/* VOLT 브랜드 영상 시안 — 코드로 그리는 10초 반복 영상 (1920×1080, 30fps).
   모든 장면은 시간 t(초)만으로 결정된다: draw(t) 를 어느 시각에 불러도 같은 그림이 나온다.
   글자는 사이트의 실제 문구(부서 이름, 첫 화면 문구)만 쓴다. */
(function () {
    'use strict';
    const W = 1920; const H = 1080; const DURATION = 10;
    const canvas = document.getElementById('film');
    const ctx = canvas.getContext('2d');
    // mode: 'reel'(글자 중심 소개 영상) | 'background'(첫 화면 배경용, 글자 없음·이음매 없는 반복)
    const MODE = window.VOLT_FILM_MODE || new URLSearchParams(location.search).get('mode') || 'reel';
    const S = MODE === 'background' ? 1280 / 1920 : 1;
    canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
    const base = () => ctx.setTransform(S, 0, 0, S, 0, 0);
    const RED = '#E8482F'; const RED_LIGHT = '#FF5F44'; const BG = '#050505'; const INK = '#f4f1ec'; const GREY = '#8b8a86';
    const LATIN = 'Bahnschrift, "Segoe UI", sans-serif';
    const KOREAN = '"Noto Sans KR", "Malgun Gothic", sans-serif';
    const logo = new Image();
    let logoReady = false;
    logo.onload = () => { logoReady = true; };
    logo.src = window.VOLT_LOGO_SRC || '../../assets/images/VOLT_logo.webp';

    // ---- 도우미 ---------------------------------------------------------------
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const span = (t, start, end) => clamp((t - start) / (end - start));
    const outCubic = (x) => 1 - Math.pow(1 - x, 3);
    const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
    const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const outBack = (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
    const lerp = (a, b, x) => a + (b - a) * x;
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // 별먼지: 고정 난수로 한 번만 만든다.
    const dust = Array.from({ length: 220 }, () => ({ x: rand() * W, y: rand() * H, z: 0.2 + rand() * 0.8, tw: rand() * 6.28 }));
    // 항로망: 게임 안 실제 지명. 좌표는 화면 배치용이다.
    const nodes = [
        { id: 'AREA18', x: 300, y: 300 }, { id: 'LORVILLE', x: 520, y: 760 }, { id: 'ORISON', x: 900, y: 420 },
        { id: 'NEW BABBAGE', x: 1380, y: 250 }, { id: 'CRU-L1', x: 1130, y: 800 }, { id: 'PYRO GATEWAY', x: 1650, y: 640 }, { id: 'HUR-L2', x: 180, y: 600 },
    ];
    const routes = [[0, 2], [2, 3], [1, 2], [2, 4], [4, 5], [3, 5], [6, 0], [6, 1], [1, 4]].map(([a, b], i) => {
        const p = nodes[a]; const q = nodes[b];
        const mx = (p.x + q.x) / 2 + (i % 2 ? 1 : -1) * 70; const my = (p.y + q.y) / 2 - 90 + (i % 3) * 40;
        return { p, q, c: { x: mx, y: my }, delay: 0.25 + i * 0.16, speed: 0.16 + (i % 4) * 0.035, phase: (i * 0.37) % 1 };
    });
    const bezier = (r, u) => {
        const a = 1 - u;
        return { x: a * a * r.p.x + 2 * a * u * r.c.x + u * u * r.q.x, y: a * a * r.p.y + 2 * a * u * r.c.y + u * u * r.q.y };
    };

    function text(str, x, y, { size, font = LATIN, weight = 700, color = INK, align = 'left', alpha = 1, spacing = 0, stroke = false, lineWidth = 2 }) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.font = `${weight} ${size}px ${font}`;
        ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
        if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.strokeText(str, x, y); }
        else { ctx.fillStyle = color; ctx.fillText(str, x, y); }
        ctx.restore();
    }

    // ---- 층 ------------------------------------------------------------------
    function background(t) {
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W * 0.62, H * 0.45, 0, W * 0.62, H * 0.45, W * 0.75);
        glow.addColorStop(0, 'rgba(232,72,47,0.10)'); glow.addColorStop(0.45, 'rgba(40,18,14,0.10)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        // 원근 격자: 아래로 흐른다.
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
        const horizon = H * 0.56;
        for (let i = 0; i < 16; i += 1) {
            const k = ((i + (t * 0.35) % 1) / 16);
            const y = horizon + Math.pow(k, 2.2) * (H - horizon);
            ctx.globalAlpha = k * 0.9;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = 0.55;
        for (let i = -12; i <= 12; i += 1) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 26, horizon); ctx.lineTo(W / 2 + i * 190, H); ctx.stroke(); }
        ctx.restore();
        for (const d of dust) {
            const x = (d.x + t * 14 * d.z) % W; const y = (d.y + t * 4 * d.z) % H;
            ctx.globalAlpha = (0.25 + 0.75 * Math.abs(Math.sin(d.tw + t * 1.3))) * d.z * 0.8;
            ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1.2 + d.z * 1.3, 1.2 + d.z * 1.3);
        }
        ctx.globalAlpha = 1;
    }

    function network(t, strength) {
        if (strength <= 0) return;
        ctx.save(); ctx.globalAlpha = strength; ctx.lineCap = 'round';
        for (const r of routes) {
            const grow = outCubic(span(t, r.delay, r.delay + 1.3));
            if (grow <= 0) continue;
            ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let u = 0; u <= grow + 1e-6; u += 0.02) { const pt = bezier(r, Math.min(u, grow)); if (u === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
            ctx.stroke();
            if (grow >= 1) {
                // 항로를 따라 달리는 화물 신호(꼬리 달린 붉은 점).
                const u = (r.phase + t * r.speed) % 1;
                for (let k = 0; k < 14; k += 1) {
                    const pt = bezier(r, clamp(u - k * 0.012));
                    ctx.globalAlpha = strength * (1 - k / 14) * 0.9;
                    ctx.fillStyle = k === 0 ? '#fff' : RED_LIGHT;
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, k === 0 ? 4.5 : 3.2 - k * 0.16, 0, 6.283); ctx.fill();
                }
                ctx.globalAlpha = strength;
            }
        }
        nodes.forEach((n, i) => {
            const on = outBack(span(t, 0.2 + i * 0.14, 0.75 + i * 0.14));
            if (on <= 0) return;
            const pulse = (t * 0.6 + i * 0.21) % 1;
            ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.globalAlpha = strength * (1 - pulse) * 0.7;
            ctx.beginPath(); ctx.arc(n.x, n.y, 8 + pulse * 34, 0, 6.283); ctx.stroke();
            ctx.globalAlpha = strength; ctx.fillStyle = INK;
            ctx.beginPath(); ctx.arc(n.x, n.y, 5 * on, 0, 6.283); ctx.fill();
            text(n.id, n.x + 16, n.y - 12, { size: 17, weight: 600, color: GREY, alpha: on * 0.9, spacing: 3 });
        });
        ctx.restore();
    }

    // 큰 글자가 아래에서 잘려 올라오는 연출.
    function riseText(str, cx, baseline, size, t, start, { font = LATIN, weight = 700, stagger = 0.085, out = null, outline = 0 }) {
        ctx.save();
        ctx.font = `${weight} ${size}px ${font}`;
        const widths = [...str].map((ch) => ctx.measureText(ch).width);
        const gap = size * 0.035;
        const total = widths.reduce((a, b) => a + b, 0) + gap * (str.length - 1);
        let x = cx - total / 2;
        [...str].forEach((ch, i) => {
            const enter = outExpo(span(t, start + i * stagger, start + i * stagger + 0.75));
            const leave = out === null ? 0 : inOut(span(t, out + i * 0.04, out + i * 0.04 + 0.45));
            if (enter > 0 && leave < 1) {
                ctx.save();
                ctx.beginPath(); ctx.rect(x - 20, baseline - size * 0.95, widths[i] + 40, size * 1.12); ctx.clip();
                const y = baseline + (1 - enter) * size * 1.05 - leave * size * 1.1;
                ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
                if (outline > 0) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.globalAlpha = outline; ctx.strokeText(ch, x, y); ctx.globalAlpha = 1 - outline; }
                ctx.fillStyle = INK; ctx.fillText(ch, x, y);
                ctx.restore();
            }
            x += widths[i] + gap;
        });
        ctx.restore();
        return total;
    }

    function sweep(t, at, y, height) {
        const p = span(t, at, at + 0.5);
        if (p <= 0 || p >= 1) return;
        const x = lerp(-W * 0.4, W * 1.1, inOut(p));
        const g = ctx.createLinearGradient(x, 0, x + W * 0.4, 0);
        g.addColorStop(0, 'rgba(232,72,47,0)'); g.addColorStop(0.7, 'rgba(232,72,47,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
        ctx.fillStyle = g; ctx.fillRect(x, y, W * 0.4, height);
    }

    function flash(t, at, color = '255,255,255') {
        const p = span(t, at, at + 0.22);
        if (p <= 0 || p >= 1) return;
        ctx.fillStyle = `rgba(${color},${(1 - p) * 0.55})`; ctx.fillRect(0, 0, W, H);
    }

    function hud(t) {
        const a = span(t, 0.3, 0.9) * (1 - span(t, 9.3, 9.9));
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = RED; ctx.fillRect(96, 92, 46, 5);
        const label = 'VOYAGERS OF LOGISTICS & TRADE';
        const shown = Math.floor(span(t, 0.45, 1.7) * label.length);
        text(label.slice(0, shown), 96, 142, { size: 26, weight: 600, spacing: 7, color: INK });
        const frame = String(Math.floor(t * 30)).padStart(3, '0');
        text(`STANTON · PYRO   ${frame}`, W - 96, 142, { size: 20, weight: 500, spacing: 4, color: GREY, align: 'right' });
        text('한국 스타시티즌 함대', 96, H - 86, { size: 30, font: KOREAN, weight: 700, color: INK, alpha: 0.9, spacing: 2 });
        text('VOLT.CEO', W - 96, H - 86, { size: 24, weight: 600, spacing: 6, color: GREY, align: 'right' });
        // 모서리 표식
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        for (const [x, y, sx, sy] of [[60, 60, 1, 1], [W - 60, 60, -1, 1], [60, H - 60, 1, -1], [W - 60, H - 60, -1, -1]]) {
            ctx.beginPath(); ctx.moveTo(x + 26 * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 26 * sy); ctx.stroke();
        }
        ctx.restore();
    }

    const WORDS = [
        { ko: '물류 & 무역', en: 'LOGISTICS & TRADE' }, { ko: '전략 자원', en: 'STRATEGIC RESOURCES' },
        { ko: '정보 & 정찰', en: 'INTEL & RECON' }, { ko: '홍보 & 미디어', en: 'OUTREACH & MEDIA' },
    ];

    function words(t) {
        const start = 5.15; const each = 0.72;
        WORDS.forEach((w, i) => {
            const s = start + i * each;
            const enter = outExpo(span(t, s, s + 0.38)); const leave = inOut(span(t, s + each - 0.16, s + each + 0.08));
            if (enter <= 0 || leave >= 1) return;
            ctx.save();
            ctx.beginPath(); ctx.rect(0, 380, W, 330); ctx.clip();
            const y = 640 + (1 - enter) * 300 - leave * 320;
            text(w.ko, W / 2, y, { size: 230, font: KOREAN, weight: 900, align: 'center', color: INK });
            ctx.restore();
            const a = enter * (1 - leave);
            text(`0${i + 1} / 04`, W / 2 - 520, 372, { size: 30, weight: 600, spacing: 6, color: RED_LIGHT, alpha: a });
            text(w.en, W / 2, 790, { size: 40, weight: 600, spacing: 16, color: GREY, align: 'center', alpha: a });
            ctx.fillStyle = RED; ctx.globalAlpha = a;
            ctx.fillRect(W / 2 - 520, 392, 1040 * outCubic(span(t, s, s + each)), 4);
            ctx.globalAlpha = 1;
        });
    }

    function lockup(t) {
        const p = outExpo(span(t, 8.05, 8.9)); const fade = 1 - span(t, 9.45, 9.95);
        if (p <= 0) return;
        ctx.save(); ctx.globalAlpha = p * fade;
        const cx = W / 2; const cy = 470;
        // 레이더 원과 회전 눈금
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        for (const r of [190, 250]) { ctx.beginPath(); ctx.arc(cx, cy, r * lerp(1.5, 1, p), 0, 6.283); ctx.stroke(); }
        ctx.strokeStyle = RED; ctx.lineWidth = 5;
        const ang = t * 2.4;
        ctx.beginPath(); ctx.arc(cx, cy, 250 * lerp(1.5, 1, p), ang, ang + 1.1); ctx.stroke();
        if (logoReady) {
            const size = 300 * lerp(1.35, 1, p);
            const ratio = logo.naturalHeight / logo.naturalWidth;
            ctx.drawImage(logo, cx - size / 2, cy - (size * ratio) / 2, size, size * ratio);
        }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = fade;
        riseText('MOVE THE VERSE.', W / 2, 880, 120, t, 8.3, { stagger: 0.03 });
        ctx.restore();
    }

    // ---- 한 장면 그리기 --------------------------------------------------------
    function draw(time) {
        const t = ((time % DURATION) + DURATION) % DURATION;
        if (MODE === 'background') { drawBackground(t); return; }
        base();
        ctx.globalAlpha = 1;
        // 천천히 밀고 들어가는 카메라 + 박자마다 짧은 흔들림
        const kick = [2.4, 5.15, 8.05].reduce((n, at) => n + (1 - span(t, at, at + 0.35)) * (t >= at ? 1 : 0), 0);
        const zoom = 1 + t * 0.006 + kick * 0.02;
        ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2 + Math.sin(t * 37) * kick * 5, -H / 2 + Math.cos(t * 29) * kick * 4);

        background(t);
        // 항로망: 처음엔 선명, 큰 글자 뒤에서는 은은하게, 마지막에 다시 사라진다.
        const net = (1 - 0.72 * span(t, 2.2, 2.8)) * (1 - span(t, 9.3, 9.9));
        network(t, net);

        // 장면 2: 큰 VOLT
        if (t >= 2.3 && t < 5.4) {
            const outline = span(t, 4.1, 4.6);
            const scale = 1 + span(t, 2.4, 5.2) * 0.07;
            ctx.save(); ctx.translate(W / 2, 600); ctx.scale(scale, scale); ctx.translate(-W / 2, -600);
            riseText('VOLT', W / 2, 720, 620, t, 2.4, { out: 4.85, outline });
            ctx.restore();
            sweep(t, 2.95, 742, 12);
            const sub = outCubic(span(t, 3.2, 3.8)) * (1 - span(t, 4.7, 5.0));
            text('물류와 무역을 위해 여행하는 항해자', W / 2, 850, { size: 46, font: KOREAN, weight: 500, align: 'center', color: INK, alpha: sub, spacing: 6 });
        }
        words(t);
        lockup(t);
        hud(t);

        base();
        flash(t, 2.4); flash(t, 5.15, '232,72,47'); flash(t, 8.05);
        // 반복 이음매: 처음과 끝을 검게.
        const edge = Math.max(1 - span(t, 0, 0.45), span(t, 9.55, 10));
        if (edge > 0) { ctx.fillStyle = `rgba(0,0,0,${edge})`; ctx.fillRect(0, 0, W, H); }
        // 필름 결(가는 가로줄)
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }

    // ---- 배경판 ---------------------------------------------------------------
    // 첫 화면 제목 뒤에 까는 용도: 글자 없음, 왼쪽은 어둡게 비움, 10초 뒤 첫 장면과 정확히 이어진다.
    // 모든 움직임은 10초에 정수 번 도는 주기 함수로만 만든다.
    const TAU = Math.PI * 2;
    const cyc = (t, turns, offset = 0) => (((t / DURATION) * turns + offset) % 1 + 1) % 1;
    const bgNodes = [
        { x: 760, y: 250 }, { x: 1010, y: 470 }, { x: 1290, y: 210 }, { x: 1560, y: 400 }, { x: 1240, y: 720 },
        { x: 1720, y: 760 }, { x: 860, y: 800 }, { x: 1830, y: 190 }, { x: 560, y: 560 }, { x: 1480, y: 930 },
    ];
    const bgRoutes = [[0, 1], [1, 2], [2, 3], [1, 4], [3, 4], [4, 5], [3, 5], [1, 6], [6, 4], [2, 7], [3, 7], [8, 1], [8, 6], [4, 9], [5, 9], [0, 2]].map(([a, b], i) => {
        const p = bgNodes[a]; const q = bgNodes[b];
        return { p, q, c: { x: (p.x + q.x) / 2 + (i % 2 ? 60 : -60), y: (p.y + q.y) / 2 - 70 + (i % 3) * 45 }, turns: 1 + (i % 3), phase: (i * 0.29) % 1 };
    });
    function drawBackground(t) {
        base();
        ctx.globalAlpha = 1;
        // 숨 쉬듯 아주 느린 확대(주기 1회)
        const breathe = 1.02 + 0.012 * Math.sin(TAU * cyc(t, 1));
        ctx.translate(W / 2, H / 2); ctx.scale(breathe, breathe); ctx.translate(-W / 2 + 10 * Math.sin(TAU * cyc(t, 1, 0.25)), -H / 2);
        ctx.fillStyle = BG; ctx.fillRect(-40, -40, W + 80, H + 80);
        const glow = ctx.createRadialGradient(W * 0.68, H * 0.5, 0, W * 0.68, H * 0.5, W * 0.62);
        glow.addColorStop(0, 'rgba(232,72,47,' + (0.13 + 0.04 * Math.sin(TAU * cyc(t, 2))).toFixed(3) + ')'); glow.addColorStop(0.5, 'rgba(48,20,15,0.10)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.fillRect(-40, -40, W + 80, H + 80);
        // 바닥 격자: 10초에 4칸 흐른다.
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
        const horizon = H * 0.6;
        for (let i = 0; i < 16; i += 1) {
            const k = (i + cyc(t, 4)) / 16;
            ctx.globalAlpha = k;
            const y = horizon + Math.pow(k, 2.2) * (H - horizon);
            ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(W + 40, y); ctx.stroke();
        }
        ctx.globalAlpha = 0.6;
        for (let i = -13; i <= 13; i += 1) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 26, horizon); ctx.lineTo(W / 2 + i * 200, H + 40); ctx.stroke(); }
        ctx.restore();
        // 별먼지: 제자리에서 반짝이며 작은 원을 그린다.
        for (const d of dust) {
            const a = TAU * cyc(t, 1, d.tw);
            ctx.globalAlpha = (0.3 + 0.7 * Math.abs(Math.sin(TAU * cyc(t, 2, d.tw)))) * d.z * 0.85;
            ctx.fillStyle = '#fff'; ctx.fillRect(d.x + Math.cos(a) * 9 * d.z, d.y + Math.sin(a) * 5 * d.z, 1.3 + d.z * 1.4, 1.3 + d.z * 1.4);
        }
        ctx.globalAlpha = 1; ctx.lineCap = 'round';
        // 항로와 화물 신호
        for (const r of bgRoutes) {
            ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(r.p.x, r.p.y); ctx.quadraticCurveTo(r.c.x, r.c.y, r.q.x, r.q.y); ctx.stroke();
            const u = cyc(t, r.turns, r.phase);
            for (let k = 0; k < 18; k += 1) {
                const v = u - k * 0.011; if (v < 0) break;
                const pt = bezier(r, v);
                ctx.globalAlpha = (1 - k / 18) * Math.sin(Math.PI * u);
                ctx.fillStyle = k === 0 ? '#fff' : RED_LIGHT;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, k === 0 ? 5 : 3.6 - k * 0.15, 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        bgNodes.forEach((n, i) => {
            const pulse = cyc(t, 2, i * 0.13);
            ctx.strokeStyle = RED; ctx.lineWidth = 1.6; ctx.globalAlpha = (1 - pulse) * 0.75;
            ctx.beginPath(); ctx.arc(n.x, n.y, 8 + pulse * 40, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 0.95; ctx.fillStyle = INK;
            ctx.beginPath(); ctx.arc(n.x, n.y, 4.5, 0, TAU); ctx.fill();
        });
        // 중심 거점의 레이더: 10초에 한 바퀴.
        const hub = bgNodes[3];
        ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
        for (const rad of [90, 150]) { ctx.beginPath(); ctx.arc(hub.x, hub.y, rad, 0, TAU); ctx.stroke(); }
        const ang = TAU * cyc(t, 1);
        const cone = ctx.createConicGradient(ang, hub.x, hub.y);
        cone.addColorStop(0, 'rgba(232,72,47,0.34)'); cone.addColorStop(0.12, 'rgba(232,72,47,0)'); cone.addColorStop(1, 'rgba(232,72,47,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = cone; ctx.beginPath(); ctx.arc(hub.x, hub.y, 150, 0, TAU); ctx.fill();
        // 긴 빛줄기 한 번(주기 1회): 오른쪽 위에서 왼쪽 아래로.
        const s = cyc(t, 1, 0.35);
        if (s < 0.22) {
            const p = s / 0.22; const x = lerp(W + 200, W * 0.35, inOut(p)); const y = lerp(60, 520, inOut(p));
            const g = ctx.createLinearGradient(x, y, x + 520, y - 190);
            g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.15, 'rgba(255,95,68,0.7)'); g.addColorStop(1, 'rgba(232,72,47,0)');
            ctx.globalAlpha = Math.sin(Math.PI * p); ctx.strokeStyle = g; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 520, y - 190); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        base();
        // 제목이 놓일 왼쪽과 아래쪽을 어둡게 덮어 글자가 읽히게 한다.
        const left = ctx.createLinearGradient(0, 0, W * 0.62, 0);
        left.addColorStop(0, 'rgba(5,5,5,0.94)'); left.addColorStop(0.55, 'rgba(5,5,5,0.55)'); left.addColorStop(1, 'rgba(5,5,5,0)');
        ctx.fillStyle = left; ctx.fillRect(0, 0, W, H);
        const bottom = ctx.createLinearGradient(0, H * 0.7, 0, H);
        bottom.addColorStop(0, 'rgba(5,5,5,0)'); bottom.addColorStop(1, 'rgba(5,5,5,0.85)');
        ctx.fillStyle = bottom; ctx.fillRect(0, H * 0.7, W, H * 0.3);
    }

    // 미리 보기: 페이지를 그냥 열면 반복 재생한다.
    let origin = null;
    function loop(now) {
        if (window.VOLT_FILM_MANUAL) return;
        if (origin === null) origin = now;
        draw((now - origin) / 1000);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // 녹화: 브라우저의 녹화 기능으로 한 바퀴(10초)를 담아 base64 로 돌려준다.
    async function record(mimeType, bitsPerSecond = 9000000) {
        window.VOLT_FILM_MANUAL = true;
        await document.fonts.ready;
        if (!logoReady) await new Promise((resolve) => { logo.addEventListener('load', resolve, { once: true }); setTimeout(resolve, 3000); });
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
        const chunks = [];
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        const done = new Promise((resolve) => { recorder.onstop = resolve; });
        let start = null; let frames = 0;
        await new Promise((resolve) => {
            const step = (now) => {
                if (start === null) { start = now; recorder.start(); }
                const t = (now - start) / 1000;
                if (t >= DURATION) { resolve(); return; }
                draw(t); frames += 1;
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
        recorder.stop(); await done;
        const blob = new Blob(chunks, { type: mimeType });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return { base64: btoa(binary), frames, size: bytes.length };
    }

    window.VOLT_FILM = { draw, record, DURATION, MODE, supported: (type) => MediaRecorder.isTypeSupported(type) };
})();
