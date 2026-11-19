// Keep the browser's native editing session alive when search results change.
(() => {
    'use strict';
    window.VOLT_SEARCH_RENDER = (root, fragment) => {
        const field = document.activeElement;
        const replacement = field?.matches('input[type="search"][id]') && root.contains(field)
            ? fragment.querySelector('#' + CSS.escape(field.id)) : null;
        if (!replacement || field.value !== replacement.value) {
            root.replaceChildren(fragment);
            return;
        }
        const path = [];
        let current = field;
        let next = replacement;
        while (current !== root && next !== fragment && current.tagName === next.tagName) {
            path.push([current, next]);
            current = current.parentNode;
            next = next.parentNode;
        }
        if (current !== root || next !== fragment) {
            root.replaceChildren(fragment);
            return;
        }
        // Patch around the focused field. Removing and reinserting that field,
        // even with the same value and caret, cancels a Korean IME session.
        for (const [live, fresh] of path.reverse()) {
            while (live.previousSibling) live.previousSibling.remove();
            while (live.nextSibling) live.nextSibling.remove();
            while (fresh.previousSibling) live.before(fresh.parentNode.firstChild);
            while (fresh.nextSibling) live.after(fresh.parentNode.lastChild);
            for (const attr of [...live.attributes]) {
                if (!fresh.hasAttribute(attr.name)) live.removeAttribute(attr.name);
            }
            for (const attr of fresh.attributes) {
                if (attr.name !== 'value' && live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value);
            }
        }
    };
})();
