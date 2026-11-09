# UI107 · Public Spectral light design

Reference: the supplied KESCO Spectral Light HTML. Adapt its pale blue surfaces,
cyan/blue/violet accents, thin borders, layered panels and restrained motion to
iHaru's existing family branding. No KESCO content or chart library is included.

## Changes

- Shared header/footer: matching Spectral accents and locally hosted Pretendard
  variable font with Unicode subsets. The existing fixed viewport shell remains;
  navigation swaps only the scrollable middle pane, including login/signup.
- Service: four function cards, interactive preview transitions, soft orbit and
  floating label, dark blue statement panel, clearer spacing and feature sections.
- Guide/notices/blog: matching filters, panels and typography. Blog artwork now
  uses topic-specific calendar, conversation, family and tuition illustrations;
  cards and articles show estimated reading time. Reading width and paragraph
  spacing improve long-form readability. Search, categories, anchors and links stay.
- Motion: footer toggle persists on this device. The OS reduced-motion setting
  takes priority, including changes while the page is open. Content is visible
  without IntersectionObserver; entrances run once and observers are disconnected.
- Signed-in scheduling, family data, authentication and database schema unchanged.

## Files

Added: `web/src/public-theme.css`, `web/src/marketing-spectral.css`, this document.

Updated: `web/src/components/PublicFrame.tsx`,
`web/src/components/PublicStories.tsx`, `web/src/pages/Marketing.tsx`,
`tests/e2e/marketing.spec.ts`. Deleted: none.

## Validation

All 197 unit/integration tests passed with two workers; TypeScript and production
build passed. The first unrestricted parallel run hit two existing time-sensitive
test failures (a rate-limit window and a 5-second timeout). Existing E2E
coverage covers fixed frame geometry at 320/820/1440px, public search/filters and
deep links; an additional scenario covers motion preference and device overrides.
Record browser execution separately from source/test compilation.

Browser E2E scenarios compile/list successfully; local Chromium execution is not
available in this environment. Production public-page review is performed with
the connected browser after deployment.
