# Privacy Policy — Claude Sidebar Monitor

**Last updated:** March 11, 2026

## Overview

Claude Sidebar Monitor is a browser extension that displays your Claude AI usage limits in the sidebar of claude.ai. This policy explains what data the extension accesses and how it is handled.

## Data accessed

The extension makes requests to the following claude.ai internal endpoints using your existing browser session:

- `/api/organizations` — to identify your account
- `/api/organizations/{id}/usage` — to read your current usage percentages
- `/api/organizations/{id}/rate_limits` — to detect your subscription plan

## Data stored locally

The extension stores the following in `chrome.storage.local` (on your device only):

- **Usage data**: session and weekly utilization percentages, reset timestamps
- **Plan label**: your subscription tier (e.g. "Pro", "Max")
- **Health status**: extension diagnostic state (e.g. "ok", "api_unreachable")

No organization ID, account name, email, or personally identifiable information is stored.

## Data NOT collected

- No data is transmitted to any external server
- No analytics, tracking, or telemetry
- No third-party services or SDKs
- No cookies are read or stored by the extension
- No browsing history is accessed outside of claude.ai

## Permissions explained

| Permission | Reason |
|---|---|
| `alarms` | Periodic background refresh of usage data |
| `storage` | Store usage data locally for instant display |
| `host_permissions: claude.ai` | Access claude.ai API endpoints to read usage |

## Open source

The full source code is available for review. The extension contains no obfuscated or minified code.

## Chrome Web Store User Data Policy compliance

The use of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. Specifically:

- Data is used solely to provide the extension's single purpose: displaying Claude usage limits.
- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's core functionality.
- Data is not used or transferred to determine creditworthiness or for lending purposes.

## Contact

For questions about this privacy policy, contact: **claude-sidebar-monitor@theocs.fr**

## Changes

This policy may be updated when the extension adds new features. The "last updated" date will reflect any changes.
