# Sh4d0w Studio — Design System

The visual language for **Sh4d0w Studio**, a desktop Minecraft Server Manager.
Dark-first (with a full light theme), violet accent, Spanish UI copy.

## Foundations
- **Tokens** — `styles.css` holds all design tokens: the brand violet ramp, semantic
  surface/text colors (themed via `[data-theme="dark|light"]`), a 4px spacing scale,
  radii, shadows and the `--grad-brand` gradient. Component classes live in `components.css`.
- **Type** — `Space Grotesk` (display/headings), `Manrope` (UI/body), `JetBrains Mono`
  (numbers & versions). Use `var(--font-display | --font-sans | --font-mono)`.
- **Theme** — set `data-theme` on `<html>`. `ThemeToggle` flips it; tokens cascade.

## Components (`window.Sh4d0wStudioDesignSystem_fd85b9`)
`Button`, `Badge` / `UserPill`, `StatCard`, `SelectableCard`, `Sidebar` (+ `SidebarBrand`,
`NavSection`, `NavItem`), `Stepper`, `Field` / `SelectField`, `Icon`, `ThemeToggle`.

Each lives in `components/<Name>/` with a `.jsx` (implementation), `.d.ts` (typed API)
and `.html` (live demo card shown in the Design System tab).

## Templates (`templates/`)
Ready-to-copy screens that consume the system via `./ds-base.js`:
- **dashboard** — the app home: window chrome, sidebar, host stat cards, server list, events.
- **crear-servidor** — step 1 of the create-server wizard: stepper + loader picker grid.

## Usage in a card / page
```html
<link rel="stylesheet" href="styles.css" />
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, Icon } = window.Sh4d0wStudioDesignSystem_fd85b9;
</script>
```
Load React + ReactDOM UMD **before** the bundle (it calls `React.createElement`).
