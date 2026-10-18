# Step 7 — Team and enterprise support

Team access and supported governance acceptance passed. **Genuine Workspace tenant sign-in remains an access dependency; Step 7 is not fully closed.** Step 8 is the next independent checklist task.

## Supported roles
| Operation | Viewer | Contributor | Admin |
|---|---|---|---|
| Read shared notes and selected mission summaries | Yes | Yes | Yes |
| Add a shared note | No | Yes | Yes |
| Launch a mission with owner-granted execution and matching authorization | No | Yes | Yes |
| Review members and directory grants | No | No | Yes |
| Manage memberships and provision viewer/contributor grants | No | No | Yes |
| Share a mission | No | No | Only a mission the admin owns |
| Read private mission artifacts or provider credentials through team membership | No | No | No |

The owner remains an active admin. Pending and revoked members have no detail/note/mission access. Owners can remove their mission share even if their team membership changes. Revocation stops future authorized team requests; it does not erase notes already read, cancel owner-authorized work already admitted or reverse an external side effect. Existing governed runner and delivery controls still apply.

## Fixes
- Email grants no longer transfer between operator IDs during passive sign-in. The existing operator remains linked until an explicit admin provisioning/reconciliation decision. Explicit reassignment revokes the prior membership and records the identity change.
- Direct provisioning, reviewed roster operations and sign-in now use one bounded identity resolver. Multiple verified matches or a full three-candidate scan fail closed rather than selecting a possibly wrong account hidden behind unverified rows. Passive ambiguous sign-in grants no team access; personal authentication can still proceed.
- Directory and Workspace profile validation reject multiple at-signs and whitespace in email addresses.
- Selected-team subscriptions and child directory/shared-mission queries sit inside a local error boundary. Revocation removes inaccessible details and offers Return to teams while create/join and navigation remain usable. Reopening after a new access decision starts fresh queries. Backend authorization remains the enforcement boundary.
- Membership role descriptions now include shared missions and permitted execution. Directory UI explains explicit identity transfer and account ambiguity.

## Deployed controlled acceptance
Two genuine OTP sessions exercised a newly created Testing team:
- pending member denial; owner demotion/revocation refused;
- viewer reads only their membership and shared notes; note writes and admin directory access denied;
- contributor note persisted and visible to owner;
- verified-email directory grant linked to the controlled operator;
- directory revocation denied reads and writes and left the owner active;
- open browser replaced the selected detail with an access-unavailable notice, then Return to teams worked;
- sign-out and a fresh OTP sign-in did not revive membership;
- both billing states unchanged, no inference or checkout; both sessions signed out and closed.

The controlled team and two authored notes remain as retained QA evidence; no existing records were edited. Private IDs are omitted from the sanitized report in docs/evidence/step7-team-access-20261018.json.

Existing deterministic delegation and authorization tests were reused; this acceptance did not launch a paid mission through the team to duplicate previously accepted work. Nine new identity/UI cases passed. Full regression: **707 tests / 125 files passed**.

## Workspace gate and supported enterprise scope
The non-secret signInOptions query reports SSO configured in both Testing and Live for **www.network-x-ai.com**. Profile checks require Google's verified email, exact configured email domain and hosted-domain claim; an email suffix alone is insufficient. Deterministic profile checks passed.

A genuine organization-controlled account and consent flow for that exact configured tenant have not been verified. The browser sandbox cannot complete real Google consent. No test identity or mocked profile is relabeled as genuine Workspace acceptance, and no domain configuration was changed. Confirm the tenant domain and complete the actual allowed/wrong-domain account checks before closing this gate; carry it into Step 16 release acceptance.

Supported scope is Google Workspace when configured, OTP access, explicit verified-email team grants, reviewed roster reconciliation, bounded shared notes and selected governed missions. Automated SCIM, SAML/custom IdPs, shared-seat billing, enterprise contractual SLAs and organization-wide sharing of private artifacts are not implemented release promises.

Limits remain 20 memberships per operator/team, 20 retained directory grants per team, 20 shared missions per team and 100 notes per team. Historical grants count toward quota. Real payment activation remains Step 17.
