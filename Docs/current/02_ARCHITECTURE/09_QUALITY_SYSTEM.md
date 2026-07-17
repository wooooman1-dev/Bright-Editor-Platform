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
Automatic manuscript improvement + Rule Validation (maximum 3)
    ↓
Approved 95+ or highest-scoring bounded result
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
2.  Improve the manuscript itself without changing weights, thresholds, or approval rules.
3.  Recalculate Rule Quality and stop on approval.
4.  Repeat no more than three times and otherwise return the highest-scoring manuscript.

## Long-term Vision

Support automated quality scoring across all supported publishing
platforms.

## Current scoring contract

The canonical weights are defined once in `core/quality/QualityScoringPolicy.ts`: Search Intent 12, SEO 12, Readability 10, Structure 12, Completeness 14, Usefulness 12, HTML 10, Image Strategy 7, Internal Links 6, and CTA 5. The server computes and persists the report against the canonical document revision. UI code only renders the returned report.

Manual document edits create a new revision and invalidate the previous approval. Publishing compares the persisted reviewed revision with the current revision and also recalculates the current document before permitting an external workflow. When required context cannot be measured, the dimension is blocked with `not_evaluated` evidence rather than receiving a passing score.
