# UI108 · Spectral presentation and reading refinement

The supplied KESCO Spectral HTML uses layered panel edges, restrained hover
illumination, compact section headers and clear selection states. This follow-up
applies those details to the existing public-page design without changing family
data or authenticated workspace behavior.

## Result

- Public service preview now explains the selected feature in a compact briefing
  row. The seven-day sample uses the real 06:00–24:00 range and proportionate
  event positions; its columns stay seven-wide at 320px.
- Overview and editorial cards gain layered edges, focus states and gentle
  hover movement. Entrance animations release the transform after finishing, so
  hover effects are not overridden. Motion-off and OS reduced motion still win.
- Notices/blog headings use less vertical space, categories show their article
  counts, and the homepage offers both notice and blog links.
- Article readers can choose normal/large body text, retained on the device.
  The outline highlights the current section using a passive, animation-frame
  throttled scroll listener; resize observation handles font/layout changes.
  Listeners and observers are removed on article changes.
- Existing shared fixed header/footer, search, filters, article anchors and
  authentication flows remain in place.

## Files

Added: this document.

Updated: `web/src/pages/Marketing.tsx`,
`web/src/components/PublicStories.tsx`, `web/src/marketing-spectral.css`,
`tests/e2e/marketing.spec.ts`, `tests/e2e/public-stories.spec.ts`.

Deleted: none. Database migrations: none.

## Verification scope

Unit/integration suite, TypeScript and production build are checked before
release. E2E scenarios cover sample range/columns, text-size persistence and
outline navigation. Browser execution and automated-test discovery are reported
separately; connected-browser review covers the deployed public pages.

Local checks: 195/197 tests passed in the full run; one family-policy test hit
the 5-second timeout and disrupted the following fixture. The entire affected
file passed separately (27/27) with one worker and a 15-second timeout. No
application or authentication changes were made for that retry. TypeScript and
the production build passed, generating 14 public entry pages. All nine public
E2E scenarios compile and are discoverable; automated browser execution is
unavailable in this runtime. Mobile device emulation is also unavailable in the
connected browser, so mobile changes receive source-level review only.
