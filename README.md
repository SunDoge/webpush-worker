<p align="center">
  <img src="apps/pwa/public/favicon.svg" alt="WebPush Worker logo" width="112" height="112" />
</p>

# webpush-worker

A lightweight, self-hosted Web Push service with a PWA console.

## Screenshots

Device management, push messages, notification history, and account settings. Captured from the running app with a local demo account; history entries are sample data.

| Devices & topics | Send a push message |
| --- | --- |
| <img src="docs/screenshots/devices.png" alt="Device registration and topic management" width="360" /> | <img src="docs/screenshots/send.png" alt="Push message editor and curl integration" width="360" /> |

| Notification history | Settings |
| --- | --- |
| <img src="docs/screenshots/history.png" alt="Notification history with topic and priority filters" width="360" /> | <img src="docs/screenshots/settings.png" alt="Account settings and API token management" width="360" /> |

## Development

To install dependencies:

```bash
pnpm install
```

To start the API and PWA development servers:

```bash
pnpm dev
```

Requirements: Node.js 26 and pnpm 12.
