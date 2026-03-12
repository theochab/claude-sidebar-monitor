# Changelog

All notable changes to Claude Sidebar Monitor will be documented in this file.

## [1.0.1] - 2026-03-12

### Fixed
- Widget and tooltip not updating when switching between dark and light theme. Claude uses `data-mode` attribute which was not being observed.

## [1.0.0] - 2026-03-12

### Initial release
- Sidebar widget with collapsed (color-coded square) and expanded (progress bars + reset countdowns) modes.
- Popup with plan badge, session/weekly limits, specific model limits, and extra usage.
- Dynamic extension icon showing usage percentage.
- Dark and light theme auto-detection.
- Arc Browser support (Little Arc window).
- Health monitoring with in-page alerts.
- Onboarding page on first install.
- i18n: English and French.
- Free plan detection and messaging.
- Shake feedback when clicking widget on usage page.
- Privacy: all data local, no tracking, no external servers.
- Open source: MIT license.
