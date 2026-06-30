# Duobaodao Electron Assistant Design

Date: 2026-06-30

## Goal

Build a desktop-only frontend assistant for Duobaodao using Electron. The app opens JD Duobaodao pages, keeps the user's login session, lets the user manually browse and search products, and stores selected product detail pages in a local watch list for reminders and quick access.

The app does not automatically click order buttons, submit bids/orders, bypass login or CAPTCHA, or call private platform order APIs.

## Scope

In scope:

- Open the user page by default:
  `https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null`
- Detect when the current page is the JD login page:
  `https://plogin.m.jd.com/login/login`
- Let the user complete login manually inside the Electron window.
- Preserve login state through Electron's normal session storage.
- Provide a home shortcut:
  `https://dbd.m.jd.com/ppdbd/paimai`
- Let the user search and open product detail pages manually in the embedded page.
- Provide an app-side "add to watch list" action for the current product detail page.
- Save watch list items locally with title, URL, added time, optional note, and optional target price.
- Show, edit, remove, and quickly reopen watch list items.
- Provide conservative reminder behavior based on visible page text and user-controlled refresh.

Out of scope:

- Automatic clicking of order or bid buttons.
- Direct order, bid, or rush-purchase API requests.
- Login bypass, CAPTCHA bypass, device fingerprint spoofing, request signing, or hidden automation.
- High-frequency refresh or request loops.

## Architecture

The project will use Electron, Vite, and TypeScript.

The main window has three areas:

- Top toolbar: navigation and app controls.
- Web content area: the JD Duobaodao mobile page.
- Watch list side panel: local product entries and actions.

Electron's main process owns the BrowserWindow, session behavior, desktop notifications, file storage, and IPC handlers. The renderer process owns the toolbar, side panel UI, and local interaction state. The JD page is isolated from the app UI; the app only reads the current URL, page title, and limited visible text needed for reminder detection.

## Navigation

On startup, the app loads:

`https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null`

If navigation reaches a URL beginning with:

`https://plogin.m.jd.com/login/login`

the toolbar displays a "need login" status. The page remains usable so the user can log in manually. After login succeeds, the app returns to normal browsing state and keeps the session.

Toolbar actions:

- Open my page.
- Open home page.
- Refresh current page.
- Go back when possible.
- Clear session and reopen login flow.
- Toggle notifications.
- Toggle always-on-top.

## Watch List

When the user is on a product detail page, they can click "add to watch list" in the app UI. The app records:

- `id`: generated locally.
- `title`: current page title, or a fallback based on URL.
- `url`: current detail page URL.
- `addedAt`: ISO timestamp.
- `note`: optional user text.
- `targetPrice`: optional user value.
- `lastSeenText`: optional latest reminder-related text snapshot.
- `lastNotifiedAt`: optional timestamp to avoid repeated notification spam.

The side panel supports:

- Open item.
- Edit note.
- Edit target price.
- Remove item.
- Show last checked or last notified time when available.

Storage uses a JSON file under Electron's `userData` directory so it survives app restarts without requiring a backend.

## Reminder Behavior

Reminder behavior stays conservative and user-controlled.

The app can inspect visible text from the currently opened page or from a watch-list item that the user opens. It looks for configurable keywords such as:

- `抢单`
- `立即抢`
- `去抢`
- `可抢`
- `开拍`

When a keyword appears, the app can:

- Show a desktop notification.
- Play a short sound.
- Bring the window to the front when enabled.
- Mark the item as recently notified.

The app does not click any page button. The user completes all platform actions manually.

Automatic refresh, if implemented in the first version, must default to a conservative interval of at least 30 seconds and be easy to turn off.

## Error Handling

- If title extraction fails, save the URL and allow the user to rename or annotate the item later.
- If storage read fails, start with an empty list and preserve the unreadable file if possible.
- If storage write fails, show an app-side error message.
- If the embedded page fails to load, show the failed URL and offer reload.
- If notification permission or delivery fails, keep the visual in-app reminder active.

## Testing

First-version verification should include:

- App starts and loads the default my page.
- Login URL detection changes toolbar status.
- Home shortcut navigates to the Duobaodao home page.
- Refresh, back, and always-on-top controls work.
- Adding a page to the watch list persists it to disk.
- Watch list survives app restart.
- Edit and remove actions update storage.
- Reminder keyword detection triggers an in-app state change and desktop notification path when available.
- No code path automatically clicks order buttons or sends order/bid API requests.
