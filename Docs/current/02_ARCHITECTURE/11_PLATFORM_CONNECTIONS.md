# Platform Connections Architecture Amendment

Status: Approved

This amendment extends the frozen architecture without changing Workspace, Brand, Project, or Content ownership.

## Ownership

`PlatformConnection` belongs to exactly one Workspace. A Project may select a Workspace connection through a `PublishingTarget` reference. Credentials are never copied into Projects.

## Boundaries

- Core owns platform-independent connection models, repository/service contracts, secret-store contracts, and connection-job contracts.
- Apps own platform URLs, validation, authentication, rendering, verification, and draft adapters.
- Server application infrastructure owns durable connection metadata, Windows secret storage, and the local connection-job process runner.
- UI receives safe public metadata and job status only.

## Secret Storage

Normal persistence stores only `secretReference`. WordPress Application Passwords use Windows current-user DPAPI encrypted files under `.bright-studio/secrets`. Tistory browser state uses an application-selected, gitignored connection directory and is never returned to clients.

Unreadable secrets are not replaced automatically. Decryption failure requires reconnection.

## Local Connection Jobs

Headed Tistory login runs as a fixed local worker launched by the server-side job runner. Jobs support polling, cancellation, timeout, duplicate prevention, safe errors, and process cleanup. Client input cannot select executables, browser arguments, or storage paths.

## Platform Flows

- Tistory: URL/identifier → connecting metadata → headed manual login → requested-blog verification → managed session → connected.
- WordPress: site URL, username, Application Password → server REST verification → DPAPI secret storage → connected.

Passwords, OTPs, CAPTCHA, and verification codes are never automated.

## Disconnect

Disconnect disables the connection and removes its local secret/session. Workspace, Project, Brand, Content, Draft, history, and external posts remain unchanged. Cleanup failure is reported and the connection remains failed for retry.

## Scope

This is local Windows application infrastructure only. It adds no cloud worker, remote account management, or public publishing.
