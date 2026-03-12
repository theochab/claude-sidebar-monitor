# Contributing to Claude Sidebar Monitor

First off, thanks for taking the time to check this out!

## About this project

I'm Théo (theo_cs), and I built this extension because I was frustrated with having to constantly navigate to the usage page just to check my Claude limits. I wanted the info right there in the sidebar, always visible.

**Full transparency:** I'm not a developer. This entire project was built using Claude Opus 4.6 as my coding partner. I described what I wanted, iterated on the design and features, tested everything manually, and Claude wrote the code. I believe in being honest about this — AI-assisted development is the future, and there's no shame in leveraging it.

The extension is **free and open source**. No tracking, no analytics, no data leaves your device.

## Current limitations

This v1 was developed and tested exclusively on the **Max plan** (Arc browser, macOS). The usage API may return different data structures depending on your plan:

- **Max 5x / Max 20x** — fully tested, should work perfectly
- **Pro** — should work for session + weekly limits, but specific model limits (Sonnet only, Opus only) may differ
- **Team / Enterprise** — untested, may have different API responses
- **Free** — basic support (shows a "Free plan" message), but untested with real free account data

If something doesn't display correctly on your plan, **please open an issue** — this is exactly the kind of feedback I need.

## How to report a bug

Open a [GitHub Issue](../../issues) and include:

1. **Your Claude plan** (Free, Pro, Max 5x, Max 20x, Team, Enterprise)
2. **Your browser** (Chrome, Arc, Brave, Edge) + version
3. **What happened** vs **what you expected**
4. **A screenshot** of the extension (widget or popup)
5. **A screenshot of your usage page** (claude.ai/settings/usage) if possible — this helps me understand what data your plan returns

The more info you give, the faster I can fix it.

## How to suggest a feature

Open a [GitHub Issue](../../issues) with the title prefixed by `[Feature]`. Describe:

- What you'd like
- Why it would be useful
- Any ideas on how it should look/work

## Code contributions

Pull requests are welcome! If you want to contribute code:

1. Fork the repo
2. Create a branch (`git checkout -b fix/your-fix`)
3. Make your changes
4. Test in Chrome/Arc with a Claude account
5. Open a pull request with a clear description

**Important:** if you modify `continuousColor()`, `formatResetShort()`, or `THRESHOLDS`, check the `@sync` comments in the code — these functions are duplicated across files and must stay in sync.

## Code of conduct

Be kind. This is a solo passion project, not a corporation. I'll do my best to respond to issues and PRs, but please be patient.

## Contact

- GitHub Issues (preferred)
- Email: claude-sidebar-monitor@theocs.fr
