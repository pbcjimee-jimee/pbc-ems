# PBC EMS Design

<!-- impeccable:design-schema 1 -->

Approved authority: PRODUCT.md and user-approved 2026-10-16-pbc-ems-design.md.
Mode: Operate. Extend PBC Quote's familiar blue identity into a company EMS.

## World and use scene

Paint Buddy & Co. staff manage customer work in an office and on a phone at a work site.
Use a quiet light surface, compact predictable controls, legible dense work lists, and clear next actions.
Preserve the Jobber menu order and PBC terminology; do not copy Jobber branding/code.
Use real data or explicitly labelled local samples. No invented business metrics.

## Tokens

- Primary #0b66d8; foreground #0f2440.
- Supporting foreground #536477; borders #d8e0e9; background #f5f7fa; surface #ffffff.
- Focus ring uses primary with adequate surrounding contrast.
- Status requires text plus restrained semantic color.
- System sans with Aptos, Segoe UI, Noto Sans KR, Malgun Gothic and sans-serif fallbacks.
- Body 14–16px; headings 24–30px, fixed rem scale; metadata 12–13px.
- Numeric table values use tabular numerals and right alignment.
- Spacing uses 4/8/12/16/24/32px steps. Group labels and inputs tightly; separate tasks clearly.
- Small control radii and subtle container edges; no decorative gradient, glass, hero or icon-card scaffolds.

## Frame

Desktop: 224px sidebar, 64px top context header, flexible work area.
Sidebar: PBC mark/company, Create disclosure, Home, Schedule, Clients, Requests,
Quotes, Jobs, Invoices, then Expenses and Timesheets.
Header: page context, authorized search, signed-in user and sign out.
Page content: title + primary action, meaningful status/filter row, actual list or task form.

Tablet: narrow sidebar/disclosure as space requires. Avoid reducing the whole page proportionally.
Mobile: navigation button with accessible dialog, persistent clear page context, stacked actions,
compact record lists with essential fields and full details on tap.
Schedule uses day/list view on narrow screens; wide month grid remains available when useful.

## Record and editing surfaces

Lists share search/filter controls and clear empty/error/loading states.
Table primary row content is an actual link; avoid row click handlers that hide keyboard affordances.
Long customer/site names wrap. Addresses keep all information on the detail page.
Forms use persistent labels, associated error text, required guidance and visible save status.
Money inputs show AUD and Ex GST/Inc GST context. Optional and selected are distinct.
Quote editor separates internal calculation from customer-visible scope/prices.
Print output is a separate allowlist document surface.

## Interaction and access

WCAG 2.2 AA target. Visible focus, semantic HTML, usable touch targets and natural focus order.
Disclosure links use native keyboard behavior; modal navigation uses native dialog focus/Escape restoration.
Hover/focus/active/disabled/loading are consistent. Errors preserve input and identify recovery.
No page-load choreography or decorative motion; reduced motion leaves immediate static feedback.
Supervisor UI prioritizes assigned work and personal records; no hidden finance in its data payload.


## Shared components (2026-10-20 Jobber-informed update)

All pages compose `components/ui/**`; do not hand-roll these patterns per page.

- `PageHeader`: back link, eyebrow (record number), title, meta row (status + client + amount), actions (secondary, `MoreMenu`, primary last).
- `Tabs` (status filters with count badges, real URLs) and `Segmented` (view switchers such as Day/Week/Month/List).
- `FilterBar` + `SelectFilter`: search first, filters, Apply/Reset. Status lives in tabs, not a duplicate select.
- `DataTable`: the primary cell holds the real record link; at ≤40rem rows become stacked cards using `data-label`.
- `Card` (title, count, action, flush), `DetailList`, `Metric`, `Notice` (info/success/warning/danger), `EmptyState` (icon + next action), `Pagination`.
- `StatusBadge`: one lifecycle tone/label map for every record type; dot + text, never colour alone.
- `WorkflowTrail`: Request → Quote → Job → Invoice links on detail pages. Supervisors never see Quote/Invoice stages.
- Detail pages use `.detail-layout`: main work column + sticky summary sidebar (sidebar moves above main under 1100px).
- Field actions (Start visit / Complete visit, Record time) sit directly under the header so they are reachable on a phone without scrolling.
- Mobile shell: top bar + bottom tab bar (Home, Schedule, Jobs, Time, More). The sidebar Create menu is the single create entry on desktop; `/` focuses global search.
