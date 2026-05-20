# Security Specification - Travlly

## Data Invariants
1. A trip must have a unique `shareToken` (32 chars) for public access.
2. Only the `ownerId` can modify or delete a trip (unless it's an anonymous trip created without login, which is allowed for transient use, but the implementation should prefer logged-in users).
3. `createdAt` is immutable.
4. `updatedAt` must always be `request.time` on writes.
5. Public access (get) is allowed if the `shareToken` is known.
6. List queries must be restricted to trips where `ownerId == request.auth.uid` OR if the trip has been specifically shared with the user's email.
7. An activity vote must have a composite document ID (`{voter_id}_{activity_id}`) to mathematically block duplicate votes.
8. `created_at` timestamp for a vote must match `request.time`.
9. An activity vote can be updated (to toggle/switch option) or deleted (to clear vote) by referencing the correct voter_id in the document ID.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to create a trip with an `ownerId` that doesn't match the current user.
2. **Immortality Breach**: Attempt to update `createdAt` after creation.
3. **Ghost Field Injection**: Attempt to add `isAdmin: true` to a trip document.
4. **ID Poisoning**: Attempt to use `../../paths` or 2KB strings as `tripId`.
5. **Token Hijacking**: Attempt to update `shareToken` to a known token of another trip.
6. **Anonymous Takeover**: Attempt to delete an anonymous trip while signed in as a different user (anonymous trips should probably only be manageable if created in the current context, or we should enforce auth for management).
7. **Budget Poisoning**: Attempt to set `budgetPerPerson` to -100 or 1,000,000.
8. **Vibe Flood**: Attempt to send 50 `vibeTags`.
9. **Blanket Read Scam**: Attempt to list all trips without an `ownerId` filter.
10. **State Skipping**: Attempt to inject a full `itinerary` during the initial `create` call (should only be added by the server/proxy logic, though here the client updates it, so we need to ensure the client can only update it after generation).
11. **Email Spam**: Attempt to add 1000 emails to `sharedEmails`.
12. **Past Date Injection**: Attempt to set `startDate` to 1990.

## Vote-Specific Malicious Payloads

13. **Voter Spoofing**: Supplying a `voter_id` in the document body that does not match the `{voter_id}` prefix in the composite document ID.
14. **Double Vote bypass**: Attempting to create a second vote document for the same activity using a random document ID, violating the composite document ID constraint.
15. **Vote Option Poisoning**: Sending an invalid `vote_type` like `"amazing"` or `"none"`.
16. **Tainted Date**: Attempting to set `created_at` to a manual historic timestamp on creation.

## Test Runner (Planned)
The `firestore.rules.test.ts` will verify these cases.
