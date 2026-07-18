# Wikimedia OAuth 2 registration worksheet

## Current Milestone 1 status

Registration has not been submitted and no OAuth implementation is active.
WikiOne shows a disabled sign-in control and a constant
`oauth-registration-pending` availability response. There are no client IDs,
secrets, callbacks, state records, sessions, cookies, authenticated upstream
calls, or publish routes. The values below are a future external worksheet, not
runtime configuration.

OAuth application creation and public approval require a Wikimedia account,
confirmed contact information, a final HTTPS deployment domain, and human review.
They therefore cannot be completed by repository automation.

## Proposed registration

Use Meta-Wiki's OAuth 2 consumer proposal form with:

| Field              | Value                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application name   | WikiOne                                                                                                                                             |
| Version            | 1.0                                                                                                                                                 |
| Description        | Standalone source editor that previews wikitext with the selected Wikipedia parser and publishes user-confirmed edits without collecting passwords. |
| Owner-only         | No                                                                                                                                                  |
| Client type        | Confidential web application                                                                                                                        |
| Grant types        | Authorization code and refresh token                                                                                                                |
| Callback           | `https://<production-editor-domain>/auth/wikimedia/callback`                                                                                        |
| Callback prefix    | No; exact callback only                                                                                                                             |
| Applicable project | `*`                                                                                                                                                 |
| Grants             | Basic rights; edit existing pages; create pages                                                                                                     |
| Allowed IP ranges  | Production egress ranges if stable; otherwise blank                                                                                                 |
| Public RSA key     | Not applicable to OAuth 2 confidential client                                                                                                       |
| Source             | `https://github.com/feconi1024/wikione`                                                                                                             |
| Privacy policy     | `https://<production-editor-domain>/privacy`                                                                                                        |

Do not request email, real name, CSS/JavaScript editing, interface editing,
deletion, blocking, private data, or administrative grants.

## Submission prerequisites

- [ ] Choose and deploy the production editor domain with HTTPS.
- [ ] Replace placeholder contact information in `.env.example` and deployment
      secrets with a monitored operator address.
- [ ] Publish the final privacy notice and security/contact pages.
- [ ] Confirm callback routing and OAuth state/session storage in staging.
- [ ] Submit the consumer from the responsible Wikimedia account.
- [ ] Follow the current approval instructions and respond to reviewer questions.
- [ ] Store the client ID and secret only in the deployment secret manager.
- [ ] Record approval date, consumer ID, grants, and callback in the operator
      runbook without committing the secret.

Development may use an owner-only consumer tied to the developer's own account,
but only after authentication work is explicitly started in a later milestone;
its token must never be committed, shared, or used for public users.
