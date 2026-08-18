# Evidence Verification Policy

> Status: Accepted
>
> This document defines the approved evidence verification, corroboration, and value-resolution policy for Bright Studio.
> Repository implementation must follow this policy unless the policy itself is explicitly changed.

## 1. Official institution sources

An official institution source is sufficient for verification when the source has been confirmed as authoritative for the Claim, its HTTP response is 2xx, and its document body is successfully extracted and non-empty.

Once those source-readiness conditions pass, every explicitly linked Claim is
verified without re-running evidence-anchor, semantic, normalized-value,
freshness, temporal, or corroboration checks. Those checks remain diagnostics
only for the authoritative route.

Official institution sources do **not** require corroboration search.

The verification flow is:

```text
Official institution source
        ↓
Official-source verification
        ↓
PASS
```

Do not search for another URL merely because the source is official.

Do not require a second official URL before allowing generation or verification.

## 2. Another URL from the same official institution

Another URL belonging to the same official institution may be retained as supporting evidence when useful, but it is not an independent institution.

Therefore:

- it does not trigger corroboration search;
- it does not count as an additional independent institution;
- it does not create an additional value-consensus vote;
- it does not replace the immediate verification pass of the official source.

The existence of multiple official URLs must never turn the official-source path into a corroboration requirement.

## 3. Non-official sources

A non-official source requires corroboration before its Claim can be treated as sufficiently supported.

The system must search for at least **one additional independent source** that supports the same Claim.

The flow is:

```text
Non-official source
        ↓
Corroboration search
        ↓
At least 1 additional independent source
        ↓
Value resolution
        ↓
PASS / sufficient evidence
```

The purpose of corroboration is to independently support a Claim originating from a non-official source.

## 4. Source value disagreement is not automatically a failure

A corroborating source may report a different literal value from the Planning Claim.

For example:

```text
Source A → 50,000원
Source B → 70,000원
Source C → 70,000원
```

If A, B, and C are fresh and belong to three independent non-official institutions, the result is **70,000원** because two independent institutions corroborate 70,000원.

The original Planning Claim value is not treated as an immutable truth. It is a starting hypothesis that evidence may correct.

Therefore:

- value disagreement alone must not produce `claim_raw_value_mismatch` as a blocking condition;
- the differing value remains visible as a diagnostic/evidence signal;
- the final normalized Claim value is selected from the verified evidence set.

## 5. Value consensus rules

Consensus is evaluated only for non-official sources after source identity,
Claim semantics, freshness, and evidence-excerpt checks have passed. It is not
used to re-open an authoritative Claim.

### 5.1 One vote per institution

Multiple URLs from the same institution count as **one** value vote.

```text
Institution A / URL 1 → 50,000원
Institution A / URL 2 → 70,000원
Institution B / URL 1 → 70,000원
```

This is not three independent votes. Institution A contributes one vote; Institution B contributes one vote.

### 5.2 Non-official corroboration majority

When there is no authoritative primary official source:

- count one vote per independent institution;
- a unique fresh majority selects the normalized value;
- two sources with different values produce a tie/conflict and must not be verified;
- three sources with a 1:2 distribution select the value supported by two institutions;
- a 2:1:1 distribution selects the value supported by two institutions only when all four votes are independent and the two-value group is uniquely dominant.

A majority never substitutes for the minimum independent-institution coverage requirement.

### 5.3 Authoritative primary source

An authoritative primary official source remains authoritative and is not overridden by a larger number of non-official sources.

If the primary official source agrees with other authoritative sources, its normalized value is authoritative.

If authoritative sources disagree, the Claim is `conflicted` and generation must remain blocked.

## 6. Claim shape must still match

Allowing value disagreement does **not** mean allowing a different Claim.

The source must still describe the same semantic Claim.

Examples:

```text
Planning: 월 50,000원
Source:   월 70,000원
→ same Claim shape, value disagreement → eligible for consensus

Planning: 월 50,000원
Source:   연 500,000원
→ different monetary basis → not the same Claim → reject
```

The same principle applies to other structured values such as percentage representation and duration unit/comparator.

## 7. Same institution is not an independent institution

A different URL from the same institution must not be counted as an independent institution for corroboration coverage or value consensus.

This applies regardless of whether the URL is technically different.

```text
Same institution + different URL
        ↓
Not an independent institution
        ↓
Do not count toward independent-institution requirement
Do not count as an additional consensus vote
```

This rule does **not** mean that an official institution source fails verification. Official institution sources already pass through the official-source path described in Section 1.

## 8. Required implementation behavior

The implementation must distinguish these paths:

```text
Official institution source
    → official-source verification
    → authoritative value
    → PASS
    → no corroboration search

Non-official source
    → corroboration search
    → find ≥ 1 independent additional source
    → resolve corroborated values
    → sufficient evidence
```

Do not apply the non-official corroboration requirement to official institution sources.

Do not use the presence of another URL from the same official institution as a reason to block an otherwise valid official source.

Do not treat the Planning Claim's initial literal value as an authoritative source of truth.

## 9. Policy priority

This policy is an approved product decision and must be treated as the source of truth for evidence verification behavior.

If tests, implementation, comments, or temporary diagnostics conflict with this policy, update the implementation/tests to conform to the policy rather than changing the policy implicitly.

A change to this behavior requires an explicit policy decision and documentation update first.
