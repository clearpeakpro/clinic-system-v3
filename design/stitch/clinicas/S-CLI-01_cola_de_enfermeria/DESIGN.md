---
name: Clinical System
colors:
  surface: '#ebfdfa'
  surface-dim: '#cbdedb'
  surface-bright: '#ebfdfa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e5f7f5'
  surface-container: '#dff2ef'
  surface-container-high: '#d9ece9'
  surface-container-highest: '#d4e6e3'
  on-surface: '#0e1e1d'
  on-surface-variant: '#3e4947'
  inverse-surface: '#233332'
  inverse-on-surface: '#e2f5f2'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#0054cb'
  on-secondary: '#ffffff'
  secondary-container: '#346ee5'
  on-secondary-container: '#fefcff'
  tertiary: '#5d33ba'
  on-tertiary: '#ffffff'
  tertiary-container: '#764fd4'
  on-tertiary-container: '#f0e6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#dae2ff'
  secondary-fixed-dim: '#b1c5ff'
  on-secondary-fixed: '#001847'
  on-secondary-fixed-variant: '#0040a0'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#22005c'
  on-tertiary-fixed-variant: '#5225af'
  background: '#ebfdfa'
  on-background: '#0e1e1d'
  surface-variant: '#d4e6e3'
typography:
  display-md:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-lg-medium:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1rem
  margin: 1.5rem
  margin-tablet: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an operational, high-efficiency interface engineered specifically for bilingual healthcare personnel in fast-paced ambulatory clinics across the United States. Designed primarily for landscape tablet interactions (1280×800) mounted on rolling carts or carried between exam rooms, the interface balances clinical authority with immediate legibility.

### Design Principles & Aesthetic
- **Synthesized Architecture (Material 3 + shadcn/ui):** Combines the structured, tonal surface hierarchy and color roles of Material 3 with the precise, minimalist density and high-contrast typography typical of modern web tools.
- **Cognitive Clarity:** Dense patient records, triage workflows, and provider queues must be parsed at a glance from 2–3 feet away under fluorescent clinic lighting. Clutter, extraneous ornamentation, and non-essential visual noise are strictly excluded.
- **Tactile Confidence:** Interactive zones meet rigorous touch ergonomics (minimum 48×48px) to eliminate mis-taps during active patient exams or rapid triage input.
- **Formal Bilingual Respect:** Microcopy maintains formal, professional Spanish (*usted* conjugation) throughout status labels, tooltips, and dialogues, preserving clinical dignity and administrative clarity across multilingual staff.

## Colors

The palette establishes clinical calm while reserving high-saturation chromas strictly for patient state signaling, critical telemetry, and deliberate action pathways.

### Palette Architecture
- **Primary Teal (`#0F766E`):** Represents focused clinical authority. Applied to primary calls to action, selected navigation states, active segmented controllers, and focal interactive elements. Paired with pure white (`#FFFFFF`) for text and icons on primary fills.
- **Background (`#F6F8F8`):** An eye-fatigue-reducing clinical off-white canvas with a cool undertone.
- **Surfaces (`#FFFFFF`):** High-clarity cards, modular panels, and modal containers. Paired with subtle structural borders (`#D7E0DF`).
- **Typography Tokens:**
  - `text-primary` (`#10201E`): Deep spruce black for maximum contrast and high-speed data parsing.
  - `text-secondary` (`#556664`): Muted slate-teal for secondary labels, table headers, metadata, and helper text.

### Visit Status Taxonomy
Status tokens are universally paired with a tinted container background (10–12% opacity) and an accessible foreground text/icon value compliant with WCAG AAA standards:
- **Waiting (`#B54708` / Container `#FEF0C7`):** Active triage wait states (*Esperando enfermería*, *Esperando proveedor*, *Procedimiento pendiente*).
- **In Care (`#175CD3` / Container `#EFF8FF`):** Active clinical engagement (*Con enfermería*, *Con proveedor*).
- **Billing & Checkout (`#6941C6` / Container `#F9F5FF`):** Administrative and billing transition (*Listo para caja*, *En caja*).
- **Completed (`#067647` / Container `#ECFDF3`):** Finalized encounters (*Completada*).
- **Registered (`#475467` / Container `#F2F4F7`):** Checked in, pending intake (*Registrado*).
- **Departed / Inactive (`#667085` / Container `#F8F9FA`):** Incomplete or departed encounters (*Se retiró*).

## Typography

The typography is built around two disciplined typefaces optimized for dense informational hierarchies:
- **Inter:** Drives all primary UI scaffolding, headings, clinical notes, and interactive states. Characterized by tall x-height, clear aperture counters, and instant legibility across ambient distances.
- **JetBrains Mono:** Dedicated solely to technical alphanumeric identifiers (such as Patient IDs `P-000123`, Visit Identifiers `LAN-V-000210`, MRNs, NDC codes, and ICD-10 keys). Monospacing prevents numeric misreadings and aligns structured codes cleanly within tables.

### Rules of Application
- Use `headline-lg` (`24px/32px semi-bold`) for page-level headers and active panel contexts.
- Use `body-lg` (`16px/24px`) as the primary text standard for clinical notes, input entry text, and modal bodies.
- Never use font sizes below `12px` (`caption`) to preserve readability under rapid cart movement and variable ambient glare.

## Layout & Spacing

The layout is optimized for a horizontal fixed-viewport target of **1280×800 (landscape tablet)**, utilizing a 12-column fluid grid system pinned to precise structural rails:

- **Sidebar Rails:** A compact 72px icon rail (collapsible) or a 240px persistent navigation rail housing high-frequency clinical actions (e.g., *Cola de Pacientes*, *Consultas*, *Admisión*).
- **Grid Layout:** 12 columns with 16px (`1rem`) gutters and 20px–24px outer safe margins.
- **Multi-Panel Split View:** Standard 1280px views employ a 4-column master list (patient queue) and an 8-column detail view (encounter record, vitals capture, and orders).
- **Rhythm Multiples:** All padding and margins adhere strictly to 8px base increments (`space-sm` = 8px, `space-md` = 16px, `space-lg` = 24px, `space-xl` = 32px), with `space-xs` (4px) reserved exclusively for internal badge padding and icon-to-text offsets.
- **Touch Target Safeguard:** All tappable controls (buttons, selectable row items, checkboxes, segmented tabs) enforce a mandatory minimum target footprint of 48×48px.

## Elevation & Depth

Visual hierarchy uses a hybrid flat-and-layered depth approach inspired by shadcn/ui and Material 3, relying on crisp surface containment rather than heavy dropped shadows.

### Elevation Levels
- **Canvas Base (`Level 0`):** `#F6F8F8` flat background. No shadow.
- **Surface Layer 1 (`Level 1` - Default Cards & Panels):**
  - Fill: `#FFFFFF`
  - Border: 1px solid `#D7E0DF`
  - Shadow: `0 1px 3px 0 rgba(16, 32, 30, 0.05), 0 1px 2px -1px rgba(16, 32, 30, 0.03)`
- **Surface Layer 2 (`Level 2` - Dropdowns, Popovers & Flyout Pickers):**
  - Fill: `#FFFFFF`
  - Border: 1px solid `#D7E0DF`
  - Shadow: `0 4px 6px -1px rgba(16, 32, 30, 0.07), 0 2px 4px -2px rgba(16, 32, 30, 0.05)`
- **Surface Layer 3 (`Level 3` - Overlays & Modal Dialogs):**
  - Fill: `#FFFFFF`
  - Border: 1px solid `#CBD5E1`
  - Shadow: `0 10px 15px -3px rgba(16, 32, 30, 0.1), 0 4px 6px -4px rgba(16, 32, 30, 0.05)`
  - Backdrop: `rgba(16, 32, 30, 0.4)` with 4px backdrop blur.

## Shapes

The geometric architecture uses systematic 12px corners on primary structural surfaces, balancing clinical precision with ergonomic softness.

- **Base Corner Radius (12px / `rounded-lg`):** Cards, encounter sections, clinical panels, tables, and modal dialog containers.
- **Component Corner Radius (8px / `rounded-md`):** Primary and secondary buttons, form input fields, select dropdowns, search triggers, and action rows.
- **Badge & Status Pill Radius (9999px / `rounded-full`):** Triage status indicators, category chips, and patient identifier pills.

## Components

### Buttons
- **Primary Button:** Solid fill `#0F766E`, text `#FFFFFF` (Inter Medium 16px), 8px corner radius, height 48px, horizontal padding 20px. Hover: `#0D655E`. Active/Pressed: `#0B554F`. Focus: 2px ring offset, 2px solid `#0F766E`.
- **Secondary Button:** Surface `#FFFFFF`, border 1px solid `#D7E0DF`, text `#10201E`, height 48px. Hover: `#F6F8F8`.
- **Destructive Button:** Surface `#FEF3F2`, border 1px solid `#FECDCA`, text `#B42318`. Hover: `#FEE4E2`.

### Status Badges & Chips
- **Container Structure:** Height 32px, pill-shaped (`rounded-full`), horizontal padding 12px, icon size 16px, typography `caption` (`12px/16px SemiBold`).
- **Variants:**
  - *Waiting (e.g., Esperando proveedor):* Background `#FEF0C7`, text `#B54708`, border 1px solid `#FEDF89`.
  - *In Care (e.g., Con enfermería):* Background `#EFF8FF`, text `#175CD3`, border 1px solid `#B2DDFF`.
  - *Checkout (e.g., Listo para caja):* Background `#F9F5FF`, text `#6941C6`, border 1px solid `#E9D7FE`.
  - *Completed (e.g., Completada):* Background `#ECFDF3`, text `#067647`, border 1px solid `#A6F4C5`.
  - *Registered (e.g., Registrado):* Background `#F2F4F7`, text `#475467`, border 1px solid `#EAECF0`.

### Form Fields & Inputs
- **Base Metrics:** Height 48px, padding 0 14px, corner radius 8px, background `#FFFFFF`, border 1px solid `#D7E0DF`, text `16px/24px` `#10201E`, placeholder `#556664`.
- **Focus State:** Border 1.5px solid `#0F766E` with ring shadow `0 0 0 3px rgba(15, 118, 110, 0.15)`.
- **Error State:** Border 1.5px solid `#D92D20`, error helper text `#D92D20` in `12px/16px`.

### Checkboxes & Radios
- Minimum touch frame 48×48px with centered 22×22px visual box.
- Visual box: 6px corner radius for checkboxes, circular for radios. Inactive border 1.5px solid `#D7E0DF`. Checked fill `#0F766E` with white mark.

### Cards & Patient Queue List Items
- **Card Container:** Background `#FFFFFF`, 12px border radius, 1px solid `#D7E0DF`, elevation Level 1.
- **Queue Row Item:** Min-height 64px, 16px internal padding, flex-row alignment. Hover state `#F6F8F8`. Left-side active indicator: 4px solid `#0F766E` when record is open in split-view. Includes monospaced ID in `JetBrains Mono` (`code-md`), patient full name in `body-lg-medium`, and visit status pill.

### Clinical Dialogs & Drawers
- Sheet sliding right-to-left for vitals entry: 480px width, full viewport height (800px), Level 3 elevation, immediate accessible primary action pinned to bottom with dual buttons (*Guardar registro* / *Cancelar*).