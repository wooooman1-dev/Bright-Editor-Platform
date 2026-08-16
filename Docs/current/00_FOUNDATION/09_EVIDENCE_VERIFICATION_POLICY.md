# Evidence Verification Policy

> Status: Accepted
>
> This document defines the approved evidence verification and corroboration policy for Bright Studio.
> Repository implementation must follow this policy unless the policy itself is explicitly changed.

## 1. Official institution sources

An official institution source is sufficient for verification when the source has been confirmed as an official source for the Claim.

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
PASS / sufficient evidence
```

The purpose of corroboration is to independently support a Claim originating from a non-official source.

## 4. Same institution is not an independent institution

A different URL from the same institution must not be counted as an independent institution for corroboration coverage.

This applies regardless of whether the URL is technically different.

```text
Same institution + different URL
        ↓
Not an independent institution
        ↓
Do not count toward independent-institution requirement
```

This rule does **not** mean that an official institution source fails verification. Official institution sources already pass through the official-source path described in Section 1.

## 5. Required implementation behavior

The implementation must distinguish these two paths:

```text
Official institution source
    → official-source verification
    → PASS
    → no corroboration search

Non-official source
    → corroboration search
    → find ≥ 1 independent additional source
    → sufficient evidence
```

Do not apply the non-official corroboration requirement to official institution sources.

Do not use the presence of another URL from the same official institution as a reason to block an otherwise valid official source.

## 6. Policy priority

This policy is an approved product decision and must be treated as the source of truth for evidence verification behavior.

If tests, implementation, comments, or temporary diagnostics conflict with this policy, update the implementation/tests to conform to the policy rather than changing the policy implicitly.

A change to this behavior requires an explicit policy decision and documentation update first.
