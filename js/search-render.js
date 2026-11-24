// Keep the browser's native editing session alive when search results change.
(() => {
    'use strict';
    // Callers supply escaped markup. Keep the native input attached across updates.
    window.VOLT_SEARCH_RENDER = (root, html) => {
        if (!root) return;
        const field = document.activeElement;
        const editing = root.contains(field) && field?.matches('input[type="search"][id]');
        const output = editing ? document.createElement('template') : root;
        output.innerHTML = html;
        if (!editing) return;
        const fragment = output.content;
        const replacement = fragment.querySelector('#' + CSS.escape(field.id));
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
