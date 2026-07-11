# Appendix: Browser Automation Layer

## Layer

```text
Apps
    │
    ▼
Core Automation Browser
    │
    ▼
Playwright
```

### Core

- Launch browser
- Close browser
- Context management
- Shared browser configuration

### App

- Login
- Navigation
- Selectors
- Page Objects
- HTML input
- Draft save
- Publishing (future)

Dependency direction:

Apps -> Core -> Playwright

Core must never depend on Apps.
