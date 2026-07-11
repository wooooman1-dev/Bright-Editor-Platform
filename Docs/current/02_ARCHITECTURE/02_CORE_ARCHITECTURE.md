# Appendix: Browser Automation Core

## Browser Automation

Platform-independent browser automation belongs in:

```text
core/
  automation/
    browser/
      BrowserManager
      BrowserSession
      BrowserOptions
      BrowserErrors
```

### Responsibilities

- Browser launch/shutdown
- BrowserContext lifecycle
- Page creation
- Shared timeout policy
- Shared logging
- Session persistence primitives

Core must never contain platform URLs, selectors, login logic, editor workflows, or publishing logic.
