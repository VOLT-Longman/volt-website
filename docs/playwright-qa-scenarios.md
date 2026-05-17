# VOLT Playwright QA Scenarios

## Critical routing
1. Open `/` and confirm the home hero is visible.
2. Open `/#ships` in a fresh tab and confirm the ships section opens.
3. Navigate to `#ships`, refresh the page, and confirm the app returns to home.
4. Use back/forward after section navigation and confirm the previous section is restored.

## Global search
1. Open search with `/`.
2. Search for a known ship such as `Carrack`.
3. Click the ship result and confirm:
   - ships section opens
   - prior ship search/filter state is reset
   - the matching ship modal opens
4. Close the modal with `Esc`.

## Ship database
1. Filter by tag.
2. Filter by manufacturer.
3. Toggle `미구현 제외`.
4. Change sort order for name, size, crew, and cargo.
5. Open a ship modal from mouse and keyboard.

## Announcements
1. Confirm pinned notices appear before non-pinned notices.
2. Filter by tag.
3. Use `더 보기` and confirm additional notices append.

## FAQ / policy
1. FAQ answers are collapsed by default.
2. Clicking a question toggles only the selected answer.
3. Policy copy-link action shows toast feedback.

## Theme and navigation
1. Toggle dark/light theme and confirm persistence after reload.
2. Open/close mobile menu and confirm focus remains trapped while open.
3. Confirm visible focus styles for nav, buttons, inputs, and selects.
