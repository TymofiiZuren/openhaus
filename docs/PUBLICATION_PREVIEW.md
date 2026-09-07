# Private publication preview

Choose **Preview listing** beside Edit listing in the manager dashboard. It opens `/manager/preview/{propertyId}` in a new tab and loads saved listing data through the existing authenticated manager API, including drafts. No status changes are made.

The Desktop (1440px), Tablet (768px), and Mobile (390px) buttons set the width of an iframe containing the same `PropertyDetailPage` component used by the public route. This exercises CSS viewport breakpoints; it does not emulate browser engines, touch input or device pixel ratios. Small screens can horizontally scroll the preview canvas.

The embedded `?frame=1` route independently requires a manager session. Uploaded image URLs use the protected manager image route so drafts are not made public. Missing listings and expired sessions retain unavailable/sign-in states. No draft content is placed in the URL or browser storage by the preview implementation.

Only saved content is shown. **Refresh saved content** reloads the frame after changes in another tab. The preview includes the existing buyer experience: outbound links may navigate within the frame, viewing requests are demonstrations, and buyer notes remain local to this browser. Kuula still requires consent before loading. It is not a substitute for real browser/device QA or publication approval.

Automated coverage: preview link for drafts, viewport switching, read-only request behavior, shared property-page rendering, protected image URL mapping and unauthenticated denial. Live signed-in visual QA remains outstanding.
