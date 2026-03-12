# Claude Sidebar Monitor

A Chrome/Arc extension that displays your Claude AI usage limits directly in the claude.ai sidebar — no clicks needed.

## Why this exists

Constantly navigating to Settings > Usage just to check your limits breaks your flow. This extension puts that info right where you work — in the sidebar, always visible, always up to date.

## Features

- **Sidebar widget** — See your session (5h) and weekly (7d) usage without leaving your conversation
- **Collapsed mode** — Color-coded square with percentage when the sidebar is narrow
- **Expanded mode** — Full progress bars, percentages, and reset countdowns when sidebar is wide
- **Popup details** — Click the extension icon for plan info, specific model limits, and extra usage. Works from any website.
- **Dynamic icon** — Extension icon shows current usage percentage with color coding
- **Dark & light theme** — Automatically adapts to your Claude theme
- **Arc Browser support** — Click the widget to open usage in a Little Arc window
- **Health monitoring** — Alerts you if the extension breaks due to API or DOM changes
- **i18n** — English and French
- **Privacy first** — All data stays on your device. No tracking, no analytics, no external servers.

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` (or `arc://extensions`)
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Pin the extension to your toolbar

## Known limitations

This extension was built and tested on the **Max plan**. Other plans may display differently:

| Plan | Status |
|---|---|
| Max 5x / 20x | Fully tested |
| Pro | Should work — feedback welcome |
| Team / Enterprise | Untested — please report |
| Free | Basic support (shows "Free plan" message) |

If something looks wrong on your plan, [open an issue](../../issues) with a screenshot of your usage page.

## How it works

The extension reads your usage data from Claude's internal API endpoints (the same ones that power the /settings/usage page). It refreshes every 2 minutes, only when a Claude tab is open.

## Permissions

| Permission | Why |
|---|---|
| `alarms` | Periodic background refresh |
| `storage` | Local data persistence |
| `host_permissions: claude.ai` | Read usage API |

## Privacy

See [PRIVACY.md](PRIVACY.md) for full details. TL;DR: everything stays local, nothing is sent anywhere.

## Security

- Explicit Content Security Policy (no eval, no external scripts)
- Zero `innerHTML` — all rendering uses safe DOM construction
- DOM spoofing protection with ownership markers
- Message sender validation
- API response schema validation
- Input sanitization on all external data

## About this project

Built by **theo_cs** using **Claude Opus 4.6** as a coding partner. I'm not a developer — I described what I wanted, designed the UX, tested everything, and Claude wrote the code. This project is a proof of what's possible when you combine a clear vision with AI.

Free and open source. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
