# Content Quality Engine

Purpose: Improve content until it is ready for publishing.

Creator Edition - Show quality score - Detailed analysis - Improvement
suggestions

Commercial Edition - Hide scores by default - Show simple
recommendations - Focus on confidence before publish

Quality Areas - SEO - Search Intent - Readability - Structure -
Reliability - Internal Links - Image Strategy

## Implemented measurable review

Quality Review is calculated on the server for the current canonical `ContentDocument` revision. A review stores `contentId`, revision ID, review time, dimension results, weighted overall score, and approval state. Browser-supplied scores are not authoritative.

| Dimension | Weight |
|---|---:|
| Search Intent | 12% |
| SEO | 12% |
| Readability | 10% |
| Content Structure | 12% |
| Content Completeness | 14% |
| Information Usefulness | 12% |
| HTML Quality | 10% |
| Image Strategy | 7% |
| Internal Links | 6% |
| CTA | 5% |

Each dimension returns a 0-100 score, status, reasons, actionable tasks, measured evidence, and whether it was evaluated. A missing required input is blocked and explicitly `not_evaluated`; it is never treated as 100. Planning language, placeholders, missing introduction/sections/conclusion, shallow body length, unplaced links/images/CTA, invalid heading structure, keyword stuffing, and unsupported-claim signals reduce or block readiness.

Length evaluation uses the confirmed content type and platform. Long-form Tistory articles require substantially more depth and structure than short posts, Shorts scripts, checklists, or comparison articles. Approval targets remain governed by the accepted 95+ quality goal.
