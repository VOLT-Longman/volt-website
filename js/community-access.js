/* Community tool gates. Access decisions come only from /auth/me. */
(function () {
    'use strict';
    const sections = ['ships', 'trade-planner', 'loadout'];
    const titles = { ships: 'nav.ships', 'trade-planner': 'nav.tradePlanner', loadout: 'nav.loadout' };
    const t = (key) => window.VOLT_I18N?.t?.(key) || key;
    let refresh = () => {};

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function render({ status, loggedIn, allowed, configured }) {
        for (const id of sections) {
            const section = document.getElementById(id);
            const content = section?.querySelector('[data-community-content]');
            const gate = section?.querySelector('.community-gate');
            if (!content || !gate) continue;
            content.hidden = !allowed;
            content.inert = !allowed;
            gate.hidden = allowed;
            if (allowed) continue;
            const hadFocus = gate.contains(document.activeElement);
            const title = element('h2', '', t(titles[id]));
            title.id = `${id}-access-title`;
            gate.setAttribute('aria-labelledby', title.id);
            gate.removeAttribute('aria-label');
            const eyebrow = element('p', 'community-gate-label', t('community.label'));
            const description = element('p', 'community-gate-description', t('community.description'));
            const steps = element('ol', 'community-gate-steps');
            for (const key of ['loginStep', 'joinStep', 'roleStep']) steps.append(element('li', '', t(`community.${key}`)));
            const key = status === 'loading' ? 'checking' : status === 'error' ? 'error'
                : !loggedIn ? 'signedOut' : configured === false ? 'unconfigured' : 'missingRole';
            const note = element('p', 'community-gate-status', t(`community.${key}`));
            note.setAttribute('role', 'status');
            const actions = element('div', 'community-gate-actions');
            if (!loggedIn && status !== 'loading') {
                const login = element('a', 'btn btn-primary', t('community.login'));
                login.href = `/auth/discord/login?returnTo=${encodeURIComponent(`/#${id}`)}`;
                actions.append(login);
            }
            const join = element('a', loggedIn ? 'btn btn-primary' : 'btn btn-secondary', t('community.join'));
            join.href = 'https://discord.gg/voltstarcitizen';
            join.target = '_blank'; join.rel = 'noopener noreferrer';
            const retry = element('button', 'btn btn-secondary', t('community.refresh'));
            retry.type = 'button'; retry.disabled = status === 'loading';
            retry.addEventListener('click', () => refresh());
            actions.append(join, retry);
            gate.replaceChildren(eyebrow, title, description, steps, note, actions);
            if (hadFocus && !retry.disabled) retry.focus({ preventScroll: true });
        }
    }

    window.VOLT_COMMUNITY = { sections, render, init: (callback) => { refresh = callback; } };
}());
