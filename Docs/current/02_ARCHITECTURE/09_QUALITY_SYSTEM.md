# 09_QUALITY_SYSTEM

## Purpose

Define measurable quality standards for all generated content.

## Workflow

``` text
Generation
    ↓
Rule Validation
    ↓
Final Editorial Review
    ↓
Rule Validation
    ↓
Standard-approved 95+ or in_review with measured findings
```

## Quality Categories

  Category           Target
  ------------------ --------
  SEO                ≥95
  Readability        ≥95
  Search Intent      ≥95
  HTML Quality       ≥95
  Image Strategy     ≥95
  Internal Linking   ≥95
  Overall            ≥95

## Validation Layers

### AI Review

-   Logical flow
-   Missing sections
-   Tone
-   User value

### Rule Validation

-   HTML structure
-   Metadata
-   ALT text
-   Heading hierarchy
-   Internal links
-   Required blocks

## Fail Policy

If the quality target is not achieved:

1.  Pass the complete Rule Quality dimensions, reasons, evidence, and tasks to the editorial AI.
2.  Use the single Final Editorial Review to make targeted corrections without changing weights, thresholds, or approval rules.
3.  Recalculate Rule Quality once.
4.  Store standard approval as ready; otherwise preserve the manuscript and findings as in_review without automatic retry.

## Long-term Vision

Support automated quality scoring across all supported publishing
platforms.

## Current scoring contract

The canonical weights are defined once in `core/quality/QualityScoringPolicy.ts`: Search Intent 12, SEO 12, Readability 10, Structure 12, Completeness 14, Usefulness 12, HTML 10, Image Strategy 7, Internal Links 6, and CTA 5. The server computes and persists the report against the canonical document revision. UI code only renders the returned report.

Manual document edits create a new revision and invalidate the previous approval. Publishing compares the persisted reviewed revision with the current revision and also recalculates the current document before permitting an external workflow. When required context cannot be measured, the dimension is blocked with `not_evaluated` evidence rather than receiving a passing score.

## Information-sufficiency content-depth contract

Core owns a platform-independent `ContentPlanQualityTarget`. The confirmed Content Opportunity persists:

- `contentDepth`: standard, deep, or comparison (`quick` is legacy read compatibility)
- core questions and reader problem
- required content elements with missing / mentioned / sufficient status
- decision criteria, examples, warnings, exceptions, and actionable next steps
- comparison, table, checklist, and scope needs
- section-type completeness guidance
- topic complexity and reader problem

The target is fingerprinted with the Opportunity and copied to canonical Content metadata. The generation schema remains strict without prose `minLength` or section-count targets. Deterministic diagnostics measure prose characters as telemetry only and evaluate section roles, list/table information elements, required-element sufficiency, and repetition.

Length never creates a warning, score deduction, Gate failure, or approval block. Missing or merely mentioned required elements, empty or incomplete sections, repeated padding, Opportunity drift, invalid HTML, and non-standard approval remain blocking. Final Review is one call, makes targeted corrections rather than broad expansion, and may not remove sufficient information, damage H2 roles, reduce information density materially, or lose protected assets, links, tags, and structure metadata.
