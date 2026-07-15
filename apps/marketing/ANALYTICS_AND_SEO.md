# Analytics and SEO measurement

## Implemented marketing events

Events use `@vercel/analytics` and contain only page/CTA labels or plan identifiers—never prompts, imported content, conversation IDs, email addresses, or names.

- `hero_start_free_clicked`
- `hero_import_demo_clicked`
- `kontinue_model_cta_clicked`
- `import_page_cta_clicked`
- `import_page_signup_clicked`
- `pricing_cta_clicked`
- `about_signup_clicked`
- `about_final_signup_clicked`
- `models_signup_clicked`
- `models_final_signup_clicked`
- `blog_to_product_clicked`

The shared `TrackedLink` component preserves the destination URL, including existing UTM parameters. GTM is loaded only when `GTM` is configured.

## Product events that belong in the application

The following events occur on `chat.kontinueai.com`, not in the marketing app. Add them in the application with the same privacy rule:

- `signup_completed`
- `import_started`
- `import_completed`
- `model_switched`

Suggested properties are limited to source platform, import method, model provider, plan tier, success/failure category, and landing-page UTM values. Do not attach message text, URLs containing private tokens, filenames, user IDs, or conversation IDs.

## Search monitoring

1. Verify `https://kontinueai.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
2. Segment organic landing pages by the model, import, platform-import, pricing, about, and security routes.
3. Group queries into branded (“Kontinue AI”, “K-AI 1.0”) and non-branded (“import ChatGPT conversation”, “African AI platform”).
4. Measure import-page CTA clicks and signup starts by landing page and UTM source.
5. Create referral segments for `chatgpt.com`, `claude.ai`, `gemini.google.com`, `perplexity.ai`, and other assistant domains.
6. Review crawl errors, duplicate titles, canonical selection, rich-result warnings, Core Web Vitals, and indexed-page counts monthly.
7. Validate visible claims against production behaviour whenever plan limits, import methods, model providers, or the K-AI implementation changes.

## Crawler policy

Search crawlers including Googlebot, Bingbot, and OAI-SearchBot are allowed on public marketing routes. Training-oriented crawlers GPTBot, Google-Extended, and CCBot are disallowed. API, Studio, and Sentry example routes are disallowed and carry or inherit noindex metadata where applicable.
