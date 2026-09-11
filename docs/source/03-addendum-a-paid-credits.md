# Addendum A — Paid prompt credits, free gallery, Supabase Free

Give this file to the implementing agent together with:

1. `JAS Ad Studio — Codex Build Prompt.md`
2. `JAS_Ad_Studio_—_Advanced_Commercial_Prompt_Quality_Requirement.md`

This addendum records owner decisions made on 11 September 2026. **Where it conflicts with either file above, this addendum wins.** Everything not mentioned here stays as specified.

---

## A1. Owner decisions

1. **There are no free AI generations.** Remove the three-prompt starter grant completely.
2. **The example gallery is the free product.** Anyone, signed in or not, can watch gallery videos, open gallery prompts and copy them.
3. **Product-specific AI generation requires purchased prompt credits.** One successful ad package costs one credit.
4. **The MVP runs on the Supabase Free plan.** Build within its limits (section A7).

---

## A2. Sections this replaces

| Build prompt section | Replace with |
|---|---|
| §3 Header | Show the credit balance when signed in: **“Qolgan promptlar: 4”**. |
| §4 Hero CTAs | Primary: **“Mahsulotim uchun prompt tayyorlash”**. Secondary: **“Bepul misollarni ko‘rish”**. Remove “3 ta bepul promptdan boshlash”. |
| §7 Visitor behavior | Visitors can use the whole gallery, including copying prompts, without signing in. Sign-in is required only to buy credits, upload product photos or generate. |
| §16 Step 3 | Show **“Bu amal 1 ta prompt kreditini ishlatadi.”** and the server-derived balance. With a zero balance, replace the generate button with **“Kredit olish”**. |
| §21 Free allowance | Replaced by A3 (credits). No starter grant. |
| §22 Exhausted allowance | Replaced by A5 (zero-balance state). |
| §23 Gallery vs allowance | Keep as written. Gallery use never needs credits or sign-in. |
| §32 Transactional allowance | Keep the reservation logic, but it now reserves and debits purchased credits (A4). Remove step “create the starter grant”. |
| §41 FAQ | Replace “3 ta bepul prompt nimani anglatadi?” with **“Prompt krediti nima?”** and **“Galereyadagi promptlar bepulmi?”** (see A6). |
| §44 Environment | Remove `PROMPT_STARTER_ALLOWANCE`. Keep packs and payment instructions in the database, not in env vars. |
| §53 Owner pilot | Pilot sellers receive credits through an owner grant (A4). |
| §54 Business validation | Drop “after free usage”. The gallery is the free trial. Measure gallery-to-purchase conversion. |
| §56 Acceptance — Quota | Replaced by A8. |

---

## A3. Credits and packs

- A **prompt credit** is JAS Ad Studio's unit for one successful product-specific AI package. It is never a Google Flow credit, a video or a Google product. Keep these apart in all copy.
- Credits come from exactly two sources:
  - `purchase`: a confirmed credit order.
  - `owner_grant`: a manual grant by the owner (pilot testers, support, compensation), with a required note.
- Packs live in a small owner-edited table or config: `id`, `credits`, `price_uzs`, `is_active`, `sort_order`.
- **Show no prices until the owner configures real packs.** Never invent prices, discounts or “most popular” badges.
- Credits do not expire in the MVP unless the owner later sets a documented rule.

---

## A4. Payment flow for the MVP: manual confirmation

Automatic payment integration is out of scope for the first version. Build this manual flow instead, designed so an automatic provider can replace the confirmation step later without redesign.

1. A signed-in user selects a pack.
2. The app shows the owner-configured payment instructions: a card number, or a Payme/Click payment link or QR code, stored as owner content.
3. The user pays outside the app and submits the order with an optional payment reference or comment.
4. The order is saved as `pending`. The user sees **“To‘lovingiz tekshirilmoqda. Tasdiqlangach kreditlar hisobingizga qo‘shiladi.”**
5. The owner verifies the payment and confirms the order by calling one server-side function, `confirm_credit_order(order_id)`, from the Supabase dashboard or a tiny owner-only protected server route. **Do not build an admin dashboard.**
6. Confirmation atomically sets the order to `paid` and inserts one `purchase` ledger entry.
7. The owner can also mark an order `rejected`, with a reason shown to the user.

Rules:

- Never show a payment as successful before the owner confirms it.
- Confirmation must be idempotent. A unique constraint on `usage_ledger.credit_order_id` guarantees that one order credits exactly once, even if it is confirmed twice.
- Only the owner role can confirm or reject. Clients can never set order status or write ledger rows.
- Later, a verified Payme or Click merchant callback can call the same `confirm_credit_order` logic. That requires a registered business and a merchant agreement with the provider; confirm the provider's current requirements before planning it.

New table: `credit_orders`

```text
id
user_id
pack_id
credits
amount_uzs
status            pending | paid | rejected | cancelled
payment_method    card_transfer | payme | click | other
payer_reference   nullable, bounded
rejection_reason  nullable
created_at
confirmed_at
confirmed_by
```

This replaces `additional_allowance_requests`.

`usage_ledger` entry types: `purchase`, `owner_grant`, `reserve`, `debit`, `release`. The balance is always derived server-side from the ledger.

---

## A5. Zero-balance state

When a signed-in user has no credits:

- Keep full access to saved projects, copying, exports, gallery, Flow links and manual text editing.
- For new generation show **“Prompt tayyorlash uchun kredit kerak.”** and the CTA **“Kredit olish”**.
- If an order is pending, show its status instead of pushing another purchase.
- Do not make paid model calls for users with a zero balance, including analysis that could return `needs_input`.

`needs_input`, `refused` and `failed` jobs still release the reserved credit, as in §32.

---

## A6. Copy changes

FAQ answers, in natural Uzbek:

- **Prompt krediti nima?** One credit prepares one product-specific ad package from your own photos. It is not a Google Flow credit and does not buy a video.
- **Galereyadagi promptlar bepulmi?** Yes. Watching examples and copying their prompts is free and needs no sign-in.

Have a native Uzbek speaker review all new UI strings before launch.

---

## A7. Supabase Free plan constraints

Build to fit the Free plan at launch (checked 11 Sep 2026: 500 MB database, 1 GB file storage, 5 GB egress per month, 50,000 monthly active users, projects paused after 1 week of inactivity, no automatic backups). Recheck the limits before launch.

1. **Gallery videos and posters must not be served from Supabase Storage.** 5 GB of egress is only about 1,250 plays of a 4 MB clip. Serve them from the app's static hosting or Cloudflare R2 (free tier, no egress fees).
2. **Keep product photos small.** Store a high-quality reference copy of at most 2048 px on the long edge (≈ 0.5–1 MB), plus the smaller model-input copy. This copy is the one users download and upload to Flow. Keeping full-size originals (~3 MB each) would fill 1 GB after roughly 170 packages.
3. **Back up the database yourself.** Credit orders and the ledger are money records, and the Free plan has no backups. Run a scheduled nightly `pg_dump` to storage outside Supabase, and document how to restore it.
4. **Handle pausing.** Gallery-only traffic may not touch the database, so a quiet week can pause the project. Add a daily health check and document how to restore a paused project.
5. **Sign-in: Google first.** Email magic links need a custom SMTP sender. Supabase's built-in email is for testing only.
6. **Document the upgrade triggers.** Move to Supabase Pro ($25/month at time of writing) when storage passes about 800 MB, egress passes about 4 GB/month, or pausing and missing backups become an unacceptable risk for paying customers.

---

## A8. Acceptance criteria (replaces §56 Quota)

- New accounts start with 0 credits. No starter grant exists anywhere in code, migrations or copy.
- An anonymous visitor can open and copy any gallery prompt without signing in.
- Confirming an order adds exactly the pack's credits once. Confirming it twice changes nothing.
- A user cannot confirm, edit or fake their own order or ledger entry.
- With one credit, two concurrent jobs cannot both succeed.
- Duplicate retries reuse the same job and result.
- Failed, refused and needs-input jobs release the reserved credit.
- A stored success survives a browser disconnect and stays debited.
- A zero-balance user triggers no paid model call.
- No price is displayed until the owner configures packs.
- Gallery videos load without using Supabase egress.
