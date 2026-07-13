/**
 * Static site-content renderers extracted from main.js.
 *
 * Data and shared helpers are injected by main.js so this module remains
 * independent of global application state and CMS refresh order.
 */
(function () {
    'use strict';

    let getData;
    let escapeHtml;
    let tx;
    let txArr;
    let i18nT;
    let renderTradeSupport;

    function init(deps) {
        ({ getData, escapeHtml, tx, txArr, i18nT, renderTradeSupport } = deps || {});
    }

    function renderTimeline() {
        const container = document.getElementById('timeline-list');
        const timeline = getData?.().timeline;
        if (!container || !Array.isArray(timeline)) return;
        container.innerHTML = timeline.map((item) => `
            <div class="timeline-item reveal">
                <div class="timeline-date">${escapeHtml(item.date)}</div>
                <div class="timeline-title">${escapeHtml(tx(item, 'title'))}</div>
                <div class="timeline-desc">${escapeHtml(tx(item, 'description'))}</div>
            </div>`).join('');
    }

    function renderHubFeatures() {
        const container = document.getElementById('hub-features');
        const features = getData?.().hub?.features;
        if (!container || !Array.isArray(features)) return;
        container.innerHTML = features.map((feature) => `
            <div class="hub-feature reveal">
                <h4>${escapeHtml(tx(feature, 'title'))}</h4>
                <ul>${txArr(feature, 'items').map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>`).join('');
    }

    function renderJoinSteps() {
        const container = document.getElementById('join-steps');
        const joinSteps = getData?.().joinSteps;
        if (!container || !Array.isArray(joinSteps)) return;
        container.innerHTML = joinSteps.map((step) => `
            <div class="join-step reveal">
                <div class="step-number">${escapeHtml(String(step.number))}</div>
                <h3>${escapeHtml(tx(step, 'title'))}</h3>
                <p>${escapeHtml(tx(step, 'description'))}</p>
            </div>`).join('');
    }

    function renderPolicy() {
        const container = document.getElementById('policy-list');
        const policy = getData?.().policy;
        if (!container || !Array.isArray(policy?.sections)) return;
        container.innerHTML = `<div class="policy-updated">${escapeHtml(i18nT('policy.lastUpdatedLabel', '최종 업데이트:'))} ${escapeHtml(policy.lastUpdated)}</div>
            ${policy.sections.map(renderPolicySection).join('')}`;
    }

    function renderPolicySection(section, index) {
        const sectionId = `policy-section-${index + 1}`;
        const notice = section.notice ? `<div class="policy-notice">${escapeHtml(tx(section, 'notice'))}</div>` : '';
        return `<div class="policy-section reveal" id="${sectionId}">
            <div class="policy-section-heading">
                <h3 class="policy-section-title">${escapeHtml(tx(section, 'title'))}</h3>
                <button class="policy-anchor-copy" type="button" data-policy-index="${index + 1}" aria-label="${escapeHtml(tx(section, 'title'))} 링크 복사"><span class="icon-link" aria-hidden="true"></span></button>
            </div>
            ${notice}
            <div class="policy-items">${section.items.map((item) => `<div class="policy-item"><span class="policy-num">${escapeHtml(tx(item, 'num'))}</span><span class="policy-text">${escapeHtml(tx(item, 'text'))}</span></div>`).join('')}</div>
        </div>`;
    }

    function renderFaq() {
        const container = document.getElementById('faq-list');
        const faq = getData?.().faq;
        if (!container || !Array.isArray(faq)) return;
        container.innerHTML = `<div class="faq-accordion">${faq.map((item, index) => `
            <div class="faq-item reveal" id="faq-item-${index}">
                <button class="faq-question" id="faq-q-${index}" aria-expanded="false" aria-controls="faq-ans-${index}">
                    <span>${escapeHtml(tx(item, 'q'))}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer" id="faq-ans-${index}" role="region" aria-labelledby="faq-q-${index}" hidden>
                    <p>${escapeHtml(tx(item, 'a'))}</p>
                </div>
            </div>`).join('')}</div>`;
    }

    function renderTradeGuide() {
        const container = document.getElementById('guide-list');
        const tradeGuide = getData?.().tradeGuide;
        if (!container || !Array.isArray(tradeGuide)) return;
        container.innerHTML = tradeGuide.map((guide) => `
            <div class="guide-card reveal">
                <div class="guide-step-num">${escapeHtml(String(guide.step))}</div>
                <h3>${escapeHtml(tx(guide, 'title'))}</h3>
                <p>${escapeHtml(tx(guide, 'content'))}</p>
            </div>`).join('');
        renderTradeSupport?.();
    }

    window.VOLT_SITE_CONTENT = {
        init,
        renderTimeline,
        renderHubFeatures,
        renderJoinSteps,
        renderPolicy,
        renderFaq,
        renderTradeGuide,
    };
})();
