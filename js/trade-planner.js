/**
 * VOLT 무역플래너(계산·추천·브리핑) 엔진 — main.js에서 분리.
 *
 * 운송 화물량·승무원·작전 조건과 선택 함선/UEX 거래 후보로 적정성·역할 배치·예상 수익을
 * 계산하고 Discord 브리핑을 생성한다. DOM 읽기/렌더는 여기서, 공용 포매터·함선 인덱스·
 * 인증 상태·UEX 모델은 main.js에서 init(deps)/VOLT_UEX_PANEL로 주입·참조한다.
 * 로드 순서: uex-panel.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 공용 의존성(이름 동일 → 이동 코드 무수정).
    let escapeHtml, formatCredits, formatPercent, showToast, getCargoValue,
        parseLargestNumber, parseSmallestNumber, getShipTags, getShipById, isLoggedIn,
        TRADE_OPERATION_CONFIG;

    function init(deps) {
        ({
            escapeHtml, formatCredits, formatPercent, showToast, getCargoValue,
            parseLargestNumber, parseSmallestNumber, getShipTags, getShipById, isLoggedIn,
            TRADE_OPERATION_CONFIG,
        } = deps || {});
    }

    function renderLogisticsRecommendation() {
        const cargoInput = document.getElementById('logistics-cargo');
        const crewInput = document.getElementById('logistics-crew');
        const shipSelect = document.getElementById('logistics-ship');
        const operationSelect = document.getElementById('trade-operation-type');
        const riskSelect = document.getElementById('trade-risk');
        const result = document.getElementById('logistics-result');
        const copyButton = document.getElementById('trade-briefing-copy');
        const shareButton = document.getElementById('trade-briefing-share');
        if (!cargoInput || !crewInput || !shipSelect || !operationSelect || !riskSelect || !result) return;
        const cargoTarget = Math.max(0, Number(cargoInput.value) || 0);
        const crewAvailable = Math.max(1, Number(crewInput.value) || 0);
        const selectedShip = getShipById(shipSelect.value);
        VOLT_UEX_PANEL.refreshForPlannerInputs();
        if (!selectedShip || cargoTarget === 0) {
            renderLogisticsPrompt(result, Boolean(selectedShip), cargoTarget);
            renderTradeToolHint(operationSelect.value);
            renderTradeChecklistPrompt();
            renderTradeBriefingPrompt();
            if (copyButton) copyButton.disabled = true;
            return;
        }
        if (copyButton) copyButton.disabled = false;
        const recommendation = buildLogisticsRecommendation({
            cargoTarget,
            crewAvailable,
            ship: selectedShip,
            operationType: operationSelect.value,
            risk: riskSelect.value
        });
        result.innerHTML = `
            <div class="operation-fit operation-fit-${escapeHtml(recommendation.fit.level)}">
                <span>${escapeHtml(recommendation.fit.label)}</span>
                <strong>${escapeHtml(recommendation.fit.summary)}</strong>
                <ul>${recommendation.fit.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
            </div>
            ${renderUexRecommendationSummary(recommendation)}
            <div class="logistics-result-main">
                <strong>${escapeHtml(recommendation.title)}</strong>
                <p>${escapeHtml(recommendation.summary)}</p>
            </div>
            <div class="logistics-result-grid">
                <div><span>\uc801\uc7ac \uc5ec\uc720</span><strong>${escapeHtml(recommendation.buffer)}</strong></div>
                ${renderHourlyProfitResult(recommendation)}
            </div>
            <div class="trade-result-columns">
                ${renderShipSuitabilityCard(recommendation)}
                ${renderRolePlanCard(recommendation)}
            </div>
            <p class="logistics-result-note">${escapeHtml(recommendation.note)}</p>`;
        renderTradeChecklist(recommendation);
        renderTradeBriefing(recommendation);
    }

    function renderHourlyProfitResult(recommendation) {
        const currentUexModel = VOLT_UEX_PANEL.getCurrentModel();
        const travelMinutes = Math.max(0, Number(document.getElementById('planner-travel-time')?.value) || 0);
        if (travelMinutes <= 0) return '';
        const sorties = Number(recommendation.sortiesCount) || 0;
        const totalMinutes = sorties * travelMinutes * 2;
        const totalHours = totalMinutes / 60;
        const totalProfit = currentUexModel?.estimatedProfit || 0;
        const hourlyProfit = totalHours > 0 ? Math.round(totalProfit / totalHours) : 0;
        return `<div id="result-hourly"><span>\uc2dc\uac04\ub2f9 \uc218\uc775 (\uc608\uc0c1)</span><strong class="result-value">${hourlyProfit.toLocaleString()} aUEC/h</strong></div>`;
    }

    function renderUexRecommendationSummary(recommendation) {
        const currentUexModel = VOLT_UEX_PANEL.getCurrentModel();
        const formatUexLocation = VOLT_UEX_PANEL.formatLocation;
        if (!currentUexModel?.bestBuy || !currentUexModel?.bestSell) return '';
        return `<section class="trade-detail-card trade-uex-summary">
            <h4>선택 거래 수익 요약</h4>
            <div class="trade-profit-grid">
                <div><span>상품</span><strong>${escapeHtml(currentUexModel.commodityLabel)}</strong></div>
                <div><span>매수 후보</span><strong>${escapeHtml(formatUexLocation(currentUexModel.bestBuy))}</strong><b>${escapeHtml(formatCredits(currentUexModel.bestBuy.price_buy))} / SCU</b></div>
                <div><span>매도 후보</span><strong>${escapeHtml(formatUexLocation(currentUexModel.bestSell))}</strong><b>${escapeHtml(formatCredits(currentUexModel.bestSell.price_sell))} / SCU</b></div>
                <div><span>필요 구매 자금</span><strong>${escapeHtml(formatCredits(currentUexModel.purchaseCost))}</strong></div>
                <div><span>예상 판매 금액</span><strong>${escapeHtml(formatCredits(currentUexModel.grossRevenue))}</strong></div>
                <div><span>예상 순수익</span><strong>${escapeHtml(formatCredits(currentUexModel.estimatedProfit))}</strong><b>${escapeHtml(formatCredits(currentUexModel.profitPerScu))} / SCU · ${escapeHtml(formatPercent(currentUexModel.profitRate))}</b></div>
            </div>
        </section>`;
    }

    function renderLogisticsPrompt(result, hasShip, cargoTarget) {
        const message = !hasShip
            ? '보유 함선을 선택하면 작전 추천을 시작합니다.'
            : cargoTarget === 0
                ? '운송 화물량을 입력하면 출격 횟수와 역할 배분을 계산합니다.'
                : '입력값을 확인해 주세요.';
        result.innerHTML = `<div class="logistics-empty">${escapeHtml(message)}</div>`;
    }

    function renderTradeChecklistPrompt() {
        const list = document.getElementById('trade-checklist');
        if (!list) return;
        list.innerHTML = [
            '운송 목표량 입력',
            '보유 함선 선택',
            '참여 인원과 위험도 설정'
        ].map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function renderTradeBriefingPrompt() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        field.value = '작전 정보를 입력하면 Discord 공유용 브리핑이 생성됩니다.';
        const shareButton = document.getElementById('trade-briefing-share');
        if (shareButton) shareButton.disabled = true;
    }

    function buildLogisticsRecommendation({ cargoTarget, crewAvailable, ship, operationType, risk }) {
        const cargoCapacity = getCargoValue(ship.cargo);
        const usableCapacity = Math.max(1, cargoCapacity);
        const sorties = Math.ceil(cargoTarget / usableCapacity);
        const minCrew = Math.max(1, parseSmallestNumber(ship.crew));
        const transportCrewNeeded = Math.min(crewAvailable, minCrew);
        const requiredEscort = getEscortRequirement(operationType, risk);
        const supportCrew = Math.max(0, crewAvailable - transportCrewNeeded);
        const totalCapacity = sorties * usableCapacity;
        const buffer = `${Math.max(0, totalCapacity - cargoTarget).toLocaleString()} SCU`;
        const title = `${getOperationLabel(operationType)} · ${ship.name} 기준 ${sorties}회 운송`;
        const summary = `${cargoTarget.toLocaleString()} SCU를 ${ship.name}(${ship.cargo})로 처리하는 구성입니다. 위험도 ${getRiskLabel(risk)} 기준, ${getOperationSummary(operationType)}.`;
        const note = buildOperationNote({ supportCrew, requiredEscort, risk });
        const rolePlan = buildRolePlan({ crewAvailable, transportCrewNeeded, requiredEscort, operationType });
        const fit = buildOperationFit({ cargoCapacity, sorties, supportCrew, requiredEscort, risk, ship });
        return {
            title,
            summary,
            sorties: `${sorties}\ud68c`,
            sortiesCount: sorties,
            transportCrew: `${transportCrewNeeded}명`,
            supportCrew: `${supportCrew}명`,
            buffer,
            note,
            operationType,
            risk,
            ship,
            cargoTarget,
            crewAvailable,
            requiredEscort,
            cargoCapacity,
            rolePlan,
            fit
        };
    }

    function buildOperationFit({ cargoCapacity, sorties, supportCrew, requiredEscort, risk, ship }) {
        const reasons = [`화물량 대비 예상 출격 ${sorties}회`, `운송 외 지원 가능 인원 ${supportCrew}명`];
        if (cargoCapacity === 0) reasons.push('선택 함선의 화물량이 0 SCU입니다.');
        if (sorties >= 3) reasons.push('출격 횟수가 3회 이상이라 추가 화물선 투입이 유리합니다.');
        if (requiredEscort > 0) reasons.push(`권장 호위 ${requiredEscort}명 중 ${Math.min(supportCrew, requiredEscort)}명 확보`);
        if (risk === 'high') reasons.push('고위험 작전은 호위와 우회 계획이 필수입니다.');
        if (getShipTags(ship).includes('미구현')) reasons.push('미구현 함선이므로 실제 라이브 운용 전 확인이 필요합니다.');
        if (cargoCapacity === 0 || (risk === 'high' && supportCrew < requiredEscort)) {
            return { level: 'poor', label: '비추천', summary: '현재 조건으로는 바로 출발하기 어렵습니다.', reasons };
        }
        if (sorties >= 3 || (requiredEscort > 0 && supportCrew === requiredEscort) || getShipTags(ship).includes('미구현')) {
            return { level: 'caution', label: '주의', summary: '진행은 가능하지만 보완이 필요한 구성입니다.', reasons };
        }
        return { level: 'good', label: '적합', summary: '현재 조건에서 무리 없이 운용 가능한 구성입니다.', reasons };
    }

    function buildRolePlan({ crewAvailable, transportCrewNeeded, requiredEscort, operationType }) {
        const routeRequired = ['convoy', 'highValue', 'bulk', 'supply'].includes(operationType);
        const route = crewAvailable >= 2 && routeRequired ? 1 : 0;
        const escort = Math.min(requiredEscort, Math.max(0, crewAvailable - transportCrewNeeded - route));
        const cargoAssistNeeded = ['bulk', 'mining', 'supply'].includes(operationType);
        const cargoAssist = cargoAssistNeeded && crewAvailable - transportCrewNeeded - route - escort > 0 ? 1 : 0;
        const reserve = Math.max(0, crewAvailable - transportCrewNeeded - route - escort - cargoAssist);
        return {
            transport: transportCrewNeeded,
            route,
            escort,
            reserve,
            cargoAssist
        };
    }

    function renderShipSuitabilityCard(recommendation) {
        const ship = recommendation.ship;
        const tags = getShipTags(ship);
        const advantages = [
            `${ship.cargo} 적재`,
            recommendation.cargoCapacity >= 500 ? '대량 운송에 유리' : '회전율 관리에 적합',
            parseLargestNumber(ship.crew) <= 2 ? '소수 인원 운용 가능' : '다인 운용에 적합'
        ];
        if (tags.includes('화물')) advantages.push('물류 목적에 직접 부합');
        if (tags.includes('입문')) advantages.push('입문 운용 난도가 낮음');
        const cautions = [];
        if (recommendation.cargoCapacity === 0) cautions.push('화물 운송 불가');
        if (parseLargestNumber(recommendation.sorties) >= 3) cautions.push('다회 출격 필요');
        if (tags.includes('미구현')) cautions.push('실제 라이브 운용 전 확인 필요');
        if (cautions.length === 0) cautions.push('특이 주의점 없음');
        const scale = getRecommendedOperationScale(recommendation);
        return `<section class="trade-detail-card">
            <h4>선택 함선 적합도</h4>
            <strong>${escapeHtml(ship.name)} · 추천 운용 규모: ${escapeHtml(scale)}</strong>
            <p>장점: ${escapeHtml(advantages.slice(0, 3).join(' / '))}</p>
            <p>주의: ${escapeHtml(cautions.join(' / '))}</p>
            <button class="btn btn-secondary trade-ship-detail" type="button" data-open-ship-id="${escapeHtml(ship.id)}">함선 상세 보기</button>
        </section>`;
    }

    function getRecommendedOperationScale(recommendation) {
        if (recommendation.cargoCapacity >= 1000) return '대형';
        if (recommendation.cargoCapacity >= 250) return '중형';
        if (parseLargestNumber(recommendation.ship.crew) <= 1) return '단독';
        return '소규모';
    }

    function renderRolePlanCard(recommendation) {
        const role = recommendation.rolePlan;
        return `<section class="trade-detail-card">
            <h4>역할 배분 추천</h4>
            <ul>
                <li>운송 담당 ${escapeHtml(String(role.transport))}명</li>
                <li>루트 확인 담당 ${escapeHtml(String(role.route))}명</li>
                <li>호위 담당 ${escapeHtml(String(role.escort))}명</li>
                <li>정찰/예비 ${escapeHtml(String(role.reserve))}명</li>
                <li>적재/하역 보조 ${escapeHtml(String(role.cargoAssist))}명</li>
            </ul>
        </section>`;
    }

    function getOperationLabel(type) {
        return TRADE_OPERATION_CONFIG[type]?.label || '무역 작전';
    }

    function getRiskLabel(risk) {
        return { low: '낮음', medium: '보통', high: '높음' }[risk] || '보통';
    }

    function getOperationSummary(type) {
        return TRADE_OPERATION_CONFIG[type]?.summary || '운송 효율을 우선합니다';
    }

    function getEscortRequirement(type, risk) {
        const base = TRADE_OPERATION_CONFIG[type]?.escortBase || 0;
        if (risk === 'high') return Math.max(base, type === 'solo' ? 1 : 2);
        if (risk === 'medium') return Math.max(base, ['bulk', 'highValue', 'supply'].includes(type) ? 1 : 0);
        return base;
    }

    function buildOperationNote({ supportCrew, requiredEscort, risk }) {
        if (requiredEscort > 0 && supportCrew < requiredEscort) {
            return `현재 인원으로는 권장 호위 ${requiredEscort}명을 채우기 어렵습니다. 위험도 ${getRiskLabel(risk)} 작전은 추가 모집 후 진행하는 편이 안전합니다.`;
        }
        if (requiredEscort > 0) {
            return `남는 인원 중 ${requiredEscort}명은 호위에 우선 배치하고, 나머지는 적재 보조와 경계에 배치하세요.`;
        }
        return supportCrew > 0
            ? `남는 ${supportCrew}명은 적재 보조, 정찰, 경계 임무에 배치하면 운용이 매끄럽습니다.`
            : '운송 인원이 빠듯합니다. 출발 전 적재와 목적지 절차를 더 단순하게 잡는 편이 좋습니다.';
    }

    function renderTradeChecklist(recommendation) {
        const list = document.getElementById('trade-checklist');
        if (!list) return;
        const items = [
            'UEX Corp에서 최신 매수·매도 위치 확인',
            'SC Trade Tools에서 화물량 기준 루트 수익 비교',
            `${recommendation.ship.name} 적재량과 출격 횟수 재확인`,
            recommendation.requiredEscort > 0 ? `호위 ${recommendation.requiredEscort}명 확보` : '호위 필요 여부 최종 확인',
            ...(TRADE_OPERATION_CONFIG[recommendation.operationType]?.checklist || []),
            'Discord 집결 채널과 출발 시각 공지',
            '착륙지·판매지 혼잡도 확인'
        ];
        list.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
        renderTradeToolHint(recommendation.operationType);
    }

    function renderTradeToolHint(operationType) {
        const hint = document.querySelector('.trade-tool-hint ol');
        if (!hint) return;
        const items = TRADE_OPERATION_CONFIG[operationType]?.toolSteps || [];
        hint.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function renderTradeBriefing(recommendation) {
        const currentUexModel = VOLT_UEX_PANEL.getCurrentModel();
        const formatUexLocation = VOLT_UEX_PANEL.formatLocation;
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        const lines = [
            '[VOLT 무역 브리핑]',
            `작전 유형: ${getOperationLabel(recommendation.operationType)}`,
            `함선: ${recommendation.ship.name} (${recommendation.ship.cargo})`,
            `목표 화물량: ${recommendation.cargoTarget.toLocaleString()} SCU`,
            ``,
            `위험도: ${getRiskLabel(recommendation.risk)}`,
            `참여 인원: ${recommendation.crewAvailable}명`
        ];
        if (currentUexModel?.bestBuy && currentUexModel?.bestSell) {
            lines.splice(4, 0,
                `상품: ${currentUexModel.commodityLabel}`,
                ``,
                `매수 후보: ${formatUexLocation(currentUexModel.bestBuy)}`,
                `매수 가격: ${formatCredits(currentUexModel.bestBuy.price_buy)} / SCU`,
                `필요 구매 자금: ${formatCredits(currentUexModel.purchaseCost)}`,
                ``,
                `매도 후보: ${formatUexLocation(currentUexModel.bestSell)}`,
                `매도 가격: ${formatCredits(currentUexModel.bestSell.price_sell)} / SCU`,
                `예상 판매 금액: ${formatCredits(currentUexModel.grossRevenue)}`,
                ``,
                `예상 계산:`,
                `예상 순수익: ${formatCredits(currentUexModel.estimatedProfit)}`,
                `SCU당 수익: ${formatCredits(currentUexModel.profitPerScu)}`,
                `수익률: ${formatPercent(currentUexModel.profitRate)}`,
                ``
            );
        }
        field.value = lines.join('\n');
        const shareButton = document.getElementById('trade-briefing-share');
        if (shareButton) shareButton.disabled = !isLoggedIn();
    }

    async function copyTradeBriefing() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        try {
            await navigator.clipboard.writeText(field.value);
            showToast('브리핑을 복사했습니다.');
        } catch (error) {
            showToast('브리핑 복사에 실패했습니다.');
        }
    }

    async function shareTradeBriefing() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        if (!isLoggedIn()) {
            showToast('Discord 로그인 후 전송할 수 있습니다.');
            return;
        }
        try {
            const response = await fetch('/api/briefing/share', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ text: field.value })
            });
            if (response.status === 429) {
                showToast('전송 간격 제한입니다. 30초 후 다시 시도해 주세요.');
                return;
            }
            if (response.status === 401 || response.status === 403) {
                showToast('함대 멤버만 Discord로 전송할 수 있습니다.');
                return;
            }
            if (!response.ok) throw new Error(`BRIEFING ${response.status}`);
            showToast('Discord 채널로 브리핑을 전송했습니다.');
        } catch (error) {
            console.warn('Briefing share failed', error);
            showToast('Discord 전송에 실패했습니다.');
        }
    }

    window.VOLT_TRADE_PLANNER = {
        init,
        renderRecommendation: renderLogisticsRecommendation,
        copyBriefing: copyTradeBriefing,
        shareBriefing: shareTradeBriefing,
        getOperationSummary, // 무역 프리셋 카드(main.js)에서도 사용
    };
})();
