# Demo video script — CiteScout for Lemon Squeezy store review

Goal: prove to the Lemon Squeezy review team that CiteScout is a real,
working product with a real website, a real free trial, and one real paid plan.
Target length: 2.5–3 minutes. Format: 1080p screen recording + voiceover, no face needed.

Website to share: https://cite-scout.com
Public product example (no login): https://cite-scout.com/demo

## Before recording

- [ ] Record on production (`cite-scout.com`), never localhost — reviewers must see the real URL in the address bar.
- [ ] Use a dedicated test account (e.g. your own Gmail). The trial scan is
      ONE-TIME per account and spends real Perplexity credits, so rehearse every
      click and only press "Run trial scan" while recording. A retake needs a fresh account.
- [ ] Log out / use a fresh browser profile so the video starts anonymous.
- [ ] Close unrelated tabs. Never show API keys, secrets, `.dev.vars`, terminals,
      the Cloudflare dashboard, or the Lemon Squeezy dashboard on screen.

## Scene 0 — Landing (0:00–0:20)

On screen: `https://cite-scout.com`, slow scroll through hero + preview.

> "CiteScout answers one question for founders: when potential buyers ask an AI
> for your category, who gets recommended? It tracks how your brand appears in
> Perplexity answers over time, compares competitors, and keeps every source
> auditable. This is the live site at cite-scout.com."

## Scene 1 — Public demo, no login (0:20–1:00)

On screen: click "Explore the live demo" → `/demo`. Scroll the dashboard:
trend, metrics, prompt table. Linger on the "Illustrative demo data" label.

> "Anyone can open the public demo without signing in. It follows OrbitCal, a
> fictional scheduling product, across fourteen days of observations — days
> recommended, days merely mentioned, days absent — with competitor share of
> voice and a partial scan day. The data is clearly labeled illustrative; real
> accounts collect genuine observations instead."

## Scene 2 — Passwordless login (1:00–1:25)

On screen: `/login`, enter the test email, complete Turnstile, submit. Cut to the
inbox showing the magic-link email from `noreply@cite-scout.com`. Click it.

> "Sign-in is passwordless. You enter your email, pass the bot check, and get a
> single-use magic link. No passwords stored anywhere."

## Scene 3 — Onboarding a project (1:25–1:50)

On screen: brand name + domain, up to three competitors, three buyer-style prompts.
Submit.

> "Setup takes about three minutes: your brand and domain, up to three
> competitors, and the buyer questions you want monitored — like best scheduling
> tool for independent consultants."

## Scene 4 — Trial scan and results (1:50–2:25)

On screen: select up to three prompts, run the one-time trial scan (show honest
progress state), then the results: brand status per prompt, first-mention
position, raw answer with highlighted mentions, citations as external links.

> "Every new account gets exactly one genuine trial scan of up to three prompts,
> run live against the Perplexity Agent API — this is real usage, not a mockup.
> Each answer is stored with its citations, so every metric stays auditable."

## Scene 5 — Pricing and upgrade path (2:25–2:50)

On screen: `/pricing` — the single $19/month plan. Then the in-app billing page
with the upgrade call to action. Mention (do NOT click through): checkout is
hosted by Lemon Squeezy and access activates only after payment verification.

> "One plan, nineteen dollars a month: ten daily prompts, three competitors,
> daily observations, full history. Checkout is hosted securely by Lemon Squeezy,
> and paid access activates only after a verified payment — a redirect alone
> grants nothing."

## Scene 6 — Outro (2:50–3:00)

On screen: back on landing, address bar visible.

> "CiteScout: know when AI recommends your competitors instead of you.
> Live now at cite-scout.com."

## Reply draft for the Lemon Squeezy review email

> Hi Lemon Squeezy team,
>
> Thanks for reviewing our store. Here is what we sell and where to see it:
>
> - Business URL: https://cite-scout.com
> - Product: "CiteScout Monitor" — a $19/month recurring subscription for
>   AI-search visibility monitoring (daily Perplexity observations, competitor
>   comparison, raw answer archive). This is the only product on the store.
> - Live product example (public, no login required): https://cite-scout.com/demo
> - Demo video walkthrough (landing → demo → signup → trial scan → pricing):
>   [VIDEO LINK]
>
> Happy to answer any questions.
>
> Thanks!
