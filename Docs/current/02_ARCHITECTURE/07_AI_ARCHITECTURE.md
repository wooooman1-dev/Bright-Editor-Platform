# 07_AI_ARCHITECTURE

## Purpose

Define the AI architecture for Bright Editor Platform.

## Principles

-   AI acts as an Editorial Team, not a single writer.
-   Minimize AI calls.
-   Provider-independent architecture.
-   Rule-based validation before additional AI calls.

## AI Pipeline

``` text
Discover
    ↓
Decide
    ↓
Create (Generation AI)
    ↓
Rule Validation
    ↓
Final Editorial Review AI
    ↓
Rule Validation
    ↓
Automatic manuscript improvement (maximum 3) + Rule Validation
    ↓
Platform Adapter
```

## AI Provider Layer

``` text
AI Provider
├── OpenAI
├── Claude
├── Gemini
└── Ollama
```

The application communicates only through the AI Provider abstraction.

## Generation AI Responsibilities

A single generation call should produce:

-   Search Intent Analysis
-   Reader Analysis
-   Outline
-   Article
-   SEO
-   HTML
-   Image Strategy
-   Internal Link Strategy
-   Ad Strategy

## Quality Review AI

Performs one final editorial review after the first Rule Validation. If the unchanged Rule Quality result remains below the accepted target, the application passes the complete measured report to the AI and improves the manuscript itself. Automatic improvement stops immediately on approval and never runs more than three times. If the target is still not reached, the highest-scoring manuscript is returned.

Checks include:

-   SEO
-   Readability
-   Search Intent
-   HTML Structure
-   Image Placement
-   Internal Links
-   Ad Placement

## Rule Validation

Code-based validation where possible.

Examples:

-   HTML validity
-   Required sections
-   Broken links
-   Image count
-   Metadata completeness

## Future Expansion

-   Prompt Versioning
-   Prompt Library
-   AI Cost Tracking
-   AI Benchmarking
