# 08_PLATFORM_ADAPTER

## Purpose

Separate platform-specific logic from the reusable Core.

## Architecture

``` text
Core
   ↓
Platform Adapter
   ├── Tistory
   ├── WordPress
   ├── YouTube
   ├── Naver Cafe
   └── Shopping
```

## Responsibilities

Platform adapters should implement:

-   Authentication
-   Content Upload
-   Image Upload
-   Draft Save
-   Publish
-   Status Retrieval

## Core Responsibility

Core must never contain platform-specific code.

## Adapter Interface (Concept)

-   Login
-   Open Editor
-   Upload Images
-   Insert HTML
-   Save Draft
-   Publish
-   Get Status

## Initial Target

Tistory Adapter

-   Playwright
-   Cookie Login
-   HTML Editor
-   Draft Save

## Future Platforms

-   WordPress
-   YouTube
-   Naver Cafe
-   Shopping
