(function () {
    'use strict';

    const DISABLED_SELECTOR = 'button, textarea, input[type="file"]';
    const READY_MESSAGE = '?? ?';

    function markControlDisabled(control) {
        control.disabled = true;
        control.setAttribute('aria-disabled', 'true');
        if (!control.title) control.title = READY_MESSAGE;
    }

    function preventPreparedFormSubmit(form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
        });
    }

    function setupVoltAiInterface() {
        const root = document.getElementById('ai');
        const form = document.getElementById('volt-ai-form');
        if (!root || !form) return;

        root.querySelectorAll(DISABLED_SELECTOR).forEach(markControlDisabled);
        preventPreparedFormSubmit(form);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupVoltAiInterface, { once: true });
        return;
    }

    setupVoltAiInterface();
}());
