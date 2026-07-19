# Wikimedia OAuth 2 registration worksheet

## Current Milestone 2 status

Public Wikimedia registration has not been approved and no OAuth implementation
is active. WikiOne now has independent first-party accounts/sessions. The
connected-app UI keeps Wikimedia disconnected, start/callback routes return 503,
and the publish route cannot write. There are no Wikimedia client IDs, secrets,
authorization state, tokens, authenticated upstream calls, or edits. The values
below are an external worksheet, not runtime configuration.

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

Any later owner-only development consumer must be isolated from public users and
its token must never be committed or shared. Enabling even that adapter requires
an explicit security-reviewed implementation stage; the current placeholders
must not be repurposed with first-party credentials.
