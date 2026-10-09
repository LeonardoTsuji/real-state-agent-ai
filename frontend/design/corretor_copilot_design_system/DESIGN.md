---
name: Corretor Copilot Design System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#784b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#996100'
  on-tertiary-container: '#ffeedd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Manrope
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  currency-display:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  currency-table:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

The design system establishes a high-performance, warm, and hyper-reliable operational interface crafted specifically for independent real estate agents. Balancing high-utility CRM data density with intelligent copilot interactions, the atmosphere is composed, decisive, and approachable.

### Philosophy & Visual Identity
- **Design Archetype:** Modern SaaS meets Executive Workbench. Precision lines, crisp content demarcations, and generous content breathing room.
- **Emotional Resonance:** Quiet confidence, clarity under pressure, and actionable intelligence. The user feels supported by an attentive, always-available digital partner rather than overwhelmed by raw database entries.
- **Interaction Posture:** Non-intrusive automation. System suggestions from the integrated AI appear as contextually docked, high-clarity insights rather than erratic popups.

## Colors

The palette leverages calibrated chromatic anchors to support immediate status scanning and clear task prioritization across dense transactional pipelines.

### Palette Architecture
- **Primary (Core Brand & Kinetic UI):** Anchor `#2563EB` (Primary 600), supported by deep executive `#1E40AF` (Primary 700) for active selection states, vibrant `#3B82F6` (Primary 500) for focus indicators, and luminous tint `#DBEAFE` (Primary 50) for copilot highlight fills and selection badges.
- **Secondary (Transaction Success & Momentum):** `#10B981` (Emerald 500) and `#059669` (Emerald 600) for closed deals, approved commissions, and confirmed property viewings; paired with `#D1FAE5` (Emerald 50) for surface indicators.
- **Tertiary (Attentiveness & Expiring Windows):** `#F59E0B` (Amber 500) and `#D97706` (Amber 600) for pending lead callbacks, aging proposals, and contract deadlines; anchored by `#FEF3C7` (Amber 50).
- **Destructive / Alert:** `#EF4444` (Red 500) and `#DC2626` (Red 600), backed by `#FEE2E2` (Red 50) for lost deals, contract cancellations, or destructive administrative actions.
- **Surface & Canvas:** Base canvas `#F8FAFC` (Slate 50), secondary utility backdrop `#F1F5F9` (Slate 100), and card/panel surface `#FFFFFF`. Structural borders leverage precise `#E2E8F0` (Slate 200).
- **Text & Neutral Contrast:** Primary copy `#0F172A` (Slate 900) ensures accessible legibility across financial figures; secondary information `#475569` (Slate 600); captions, placeholders, and meta-labels `#94A3B8` (Slate 400).

## Typography

Typography pairs `Manrope` for structured headings and financial figures with `Inter` for data tables, form fields, and copilot dialogue streams.

### Principles & Number Formatting
- **Financial Precision:** Currency representations (`R$`) enforce tabular figures (`font-feature-settings: 'tnum' 1, 'cv01' 1`) across all metric cards and pipeline tables to eliminate character jitter during inline edits.
- **Vertical Scannability:** Header tracking is tightened slightly to establish robust hierarchy against white cards, while small labels use open tracking with uppercase formatting where context demands rapid status recognition.
- **Copilot Content Stream:** AI-generated suggestions, message drafts, and property match briefs use `body-md` with 20px line height to optimize rapid reading.

## Layout & Spacing

The system applies an 8pt architectural rhythm layered onto an adaptive sidebar-plus-content model.

### Spatial Grid & Screen Architecture
- **Desktop (1280px+):** Fixed 260px collapsible operational navigation sidebar, paired with a 12-column fluid grid in the central viewport. Kanban boards and data tables stretch horizontally with structured outer margin of 32px (`space-xl`).
- **Tablet (768px – 1279px):** Sidebar collapses to an icon rail (72px). Central work area adapts with 24px margins (`margin`), stacking multi-column dashboard widgets into single or paired cards.
- **Mobile (<768px):** Navigation transitions to an off-canvas drawer combined with an essential bottom floating bar. Gutters tighten to 16px (`gutter-mobile`), margins to 16px (`margin-mobile`), and horizontal Kanban boards convert to tabbed stage views.
- **Copilot Slide-Over:** On desktop and tablet viewports, the AI assistant utilizes an anchor drawer of 384px width, docked to the right, adjusting the central canvas without modal obstruction.

## Elevation & Depth

Visual hierarchy relies on low-contrast structural outlines complemented by ambient, low-saturation drop shadows. The design avoids heavy stacked skeuomorphism, prioritizing pristine clean surfaces.

### Surface Tiers
- **Tier 0 (App Canvas):** Flat `#F8FAFC`, no elevation, completely grounded.
- **Tier 1 (Cards, Pipeline Columns, Panels):** Pure `#FFFFFF` surface enclosed by a 1px solid `#E2E8F0` border. Shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)`.
- **Tier 2 (Interactive Hover, Filter Menus, Dropped Popovers):** Pure `#FFFFFF` surface with `#E2E8F0` border. Shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Tier 3 (Modals, AI Assistant Drawer):** `#FFFFFF` surface. Shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`, accompanied by a calibrated backdrop overlay tinted at `rgba(15, 23, 42, 0.45)`.
- **Copilot Accent Surface:** Cards initiated or curated by the AI agent use a 1px border colored `#DBEAFE` and an internal soft wash gradient from `#FFFFFF` to `rgba(219, 234, 254, 0.25)`.

## Shapes

The geometric identity is defined by measured softness (`roundedness: 2`), reflecting precision and approachable craftsmanship without playful bubble tendencies.

### Curvature Guidelines
- **Core Controls & Form Inputs:** 8px (`0.5rem`) corner radius applied across input boxes, standard buttons, dropdown triggers, and filter chips.
- **Structural Containers:** Cards, data panels, pipeline boards, and table wrappers receive 12px to 16px (`rounded-lg` to `rounded-xl`) outer radius to soften interface density.
- **Badges & Pipeline Status Indicators:** Semi-pill rounded radius (9999px) strictly for stage capsules and micro tag indicators to maintain instant optical distinction from square control elements.

## Components

### Buttons
- **Primary:** Filled `#2563EB`, text `#FFFFFF`, font `label-md`, height 40px (desktop) / 44px (mobile touch targets). Hover: `#1E40AF`. Active: transform scale 0.99. Focus-visible: 2px offset ring in `#3B82F6`.
- **Secondary:** Surface `#FFFFFF`, border 1px solid `#E2E8F0`, text `#0F172A`. Hover: surface `#F8FAFC`, border `#CBD5E1`.
- **Copilot Action:** Gradient border or solid `#DBEAFE` background with `#1E40AF` text, leading with a spark icon.
- **Two-Click Confirmations:** For impactful automated AI recommendations (e.g., auto-dispatching a WhatsApp follow-up or reassigning a deal), the primary button morphs on first press to an amber-accented "Confirmar envio?" state with a 3-second auto-revert countdown.

### Pipeline Status Badges
Status indicators leverage a pill format with muted tint fills and bold, high-contrast text:
- **Novo:** Background `#F1F5F9`, text `#475569`.
- **Contatado:** Background `#DBEAFE`, text `#1E40AF`.
- **Qualificado:** Background `#E0E7FF`, text `#4338CA`.
- **Visita Agendada:** Background `#FEF3C7`, text `#D97706`.
- **Negociação:** Background `#EDE9FE`, text `#6D28D9`.
- **Ganho:** Background `#D1FAE5`, text `#065F46`.
- **Perdido:** Background `#FEE2E2`, text `#991B1B`.

### Form Inputs & Currency Selectors
- **Input Fields:** 40px height, background `#FFFFFF`, border 1px solid `#CBD5E1`, internal padding 0 12px, placeholder `#94A3B8`. Focus: border `#2563EB`, box-shadow `0 0 0 3px rgba(37, 99, 235, 0.15)`.
- **Currency Field (R$):** Affixed non-editable `R$` prefix in `#64748B` with `font-weight: 500`. Field automatically applies localized Brazilian thousands separators (`1.500.000,00`).

### Checkboxes & Radios
- **Checkbox:** 18x18px, border 1.5px solid `#CBD5E1`, radius 4px. Checked state: solid `#2563EB` fill with white SVG checkmark.
- **Radio:** 18x18px, rounded 9999px. Checked: white core surrounded by `#2563EB` 5px solid border.

### Data Tables
- Row height: 48px regular, 40px compact.
- Header row: background `#F8FAFC`, text `#475569`, `label-sm` uppercase, border bottom 1px solid `#E2E8F0`.
- Cells: text `#0F172A`, border bottom 1px solid `#F1F5F9`. Hover row: `#F8FAFC`.
- Pagination: Right-aligned, minimal controls (`Anterior` / `Próxima` icons, discreet `#475569` counter).

### AI Copilot Insight Cards
- Dedicated container featuring a 1px solid `#BFDBFE` border and a 3px accent bar in `#2563EB` along the left rim.
- Houses a concise executive summary, the reasoning behind the recommendation (e.g., "Lead visitou o anúncio 3 vezes nas últimas 24h"), and rapid action buttons ("Revisar Mensagem", "Descartar").

### Modals & Dialogs
- Centered layout, max-width 560px for standard flows, 800px for comprehensive property/lead records.
- Header with clear title and close icon (`#94A3B8` hover `#0F172A`), body padding 24px, separated footer actions with right-aligned dismiss and primary triggers.