/* @ds-bundle: {"format":3,"namespace":"Sh4d0wStudioDesignSystem_fd85b9","components":[{"name":"Badge","sourcePath":"components/Badge/Badge.jsx"},{"name":"UserPill","sourcePath":"components/Badge/Badge.jsx"},{"name":"Button","sourcePath":"components/Button/Button.jsx"},{"name":"Field","sourcePath":"components/Field/Field.jsx"},{"name":"SelectField","sourcePath":"components/Field/Field.jsx"},{"name":"Icon","sourcePath":"components/Icon/Icon.jsx"},{"name":"SelectableCard","sourcePath":"components/SelectableCard/SelectableCard.jsx"},{"name":"Sidebar","sourcePath":"components/Sidebar/Sidebar.jsx"},{"name":"SidebarBrand","sourcePath":"components/Sidebar/Sidebar.jsx"},{"name":"NavItem","sourcePath":"components/Sidebar/Sidebar.jsx"},{"name":"NavSection","sourcePath":"components/Sidebar/Sidebar.jsx"},{"name":"StatCard","sourcePath":"components/StatCard/StatCard.jsx"},{"name":"Stepper","sourcePath":"components/Stepper/Stepper.jsx"},{"name":"ThemeToggle","sourcePath":"components/ThemeToggle/ThemeToggle.jsx"}],"sourceHashes":{"components/Badge/Badge.jsx":"013d20281814","components/Button/Button.jsx":"eb229a7fbafa","components/Field/Field.jsx":"f9093f163798","components/Icon/Icon.jsx":"0fb88a53bc99","components/SelectableCard/SelectableCard.jsx":"e49fd24ef496","components/Sidebar/Sidebar.jsx":"1c7a6b730764","components/StatCard/StatCard.jsx":"5281569da8c3","components/Stepper/Stepper.jsx":"0ad2dafcf417","components/ThemeToggle/ThemeToggle.jsx":"af153c6c45f8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.Sh4d0wStudioDesignSystem_fd85b9 = window.Sh4d0wStudioDesignSystem_fd85b9 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/Badge/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  variant = 'default',
  pill = false,
  dot = false,
  children,
  className = '',
  ...rest
}) {
  const cls = ['badge', variant !== 'default' ? 'badge--' + variant : '', pill ? 'badge--pill' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    className: "badge__dot"
  }) : null, children);
}

/** The violet user pill with a glowing dot, e.g. the logged-in account chip. */
function UserPill({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['user-pill', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "badge__dot"
  }), children);
}
Object.assign(__ds_scope, { Badge, UserPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Badge/Badge.jsx", error: String((e && e.message) || e) }); }

// components/Button/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  children,
  className = '',
  ...rest
}) {
  const cls = ['btn', 'btn--' + variant, 'btn--' + size, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    className: "btn__icon"
  }, icon) : null, children != null ? /*#__PURE__*/React.createElement("span", {
    className: "btn__label"
  }, children) : null, iconRight ? /*#__PURE__*/React.createElement("span", {
    className: "btn__icon"
  }, iconRight) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Button/Button.jsx", error: String((e && e.message) || e) }); }

// components/Field/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Field({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['field', className].filter(Boolean).join(' ')
  }, label ? /*#__PURE__*/React.createElement("span", {
    className: "field__label"
  }, label) : null, /*#__PURE__*/React.createElement("input", _extends({
    className: "field__control"
  }, rest)));
}
function SelectField({
  label,
  options = [],
  placeholder,
  value,
  defaultValue,
  className = '',
  children,
  ...rest
}) {
  const isPlaceholder = (value != null ? value : defaultValue) ? false : !!placeholder;
  return /*#__PURE__*/React.createElement("label", {
    className: ['field', isPlaceholder ? 'field--placeholder' : '', className].filter(Boolean).join(' ')
  }, label ? /*#__PURE__*/React.createElement("span", {
    className: "field__label"
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    className: "field__select-wrap"
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: "field__control",
    value: value,
    defaultValue: defaultValue
  }, rest), placeholder ? /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder) : null, options.map((o, i) => {
    const val = typeof o === 'string' ? o : o.value;
    const lab = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: i,
      value: val
    }, lab);
  }), children), /*#__PURE__*/React.createElement("svg", {
    className: "icon",
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6"
  }))));
}
Object.assign(__ds_scope, { Field, SelectField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Field/Field.jsx", error: String((e && e.message) || e) }); }

// components/Icon/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  ram: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M7 11h2M11 11h2M15 11h2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-2.2-4.4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1.6 1.3H12a2 2 0 0 1-2-2v-.1A1.6 1.6 0 0 0 9 19a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-.7-2.7 1.6 1.6 0 0 0-1.3-1.6V12a2 2 0 0 1 2-2h.1A1.6 1.6 0 0 0 5 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 15 5a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bolt: '<path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/>'
};
function Icon({
  name,
  size,
  className = '',
  style,
  ...rest
}) {
  const path = ICON_PATHS[name] || '';
  const merged = size ? {
    fontSize: typeof size === 'number' ? size + 'px' : size,
    ...style
  } : style;
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: ['icon', className].filter(Boolean).join(' '),
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    style: merged,
    "aria-hidden": "true",
    dangerouslySetInnerHTML: {
      __html: path
    }
  }, rest));
}
Icon.names = Object.keys(ICON_PATHS);
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/SelectableCard/SelectableCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SelectableCard({
  title,
  description,
  tags = [],
  selected = false,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['select-card', className].filter(Boolean).join(' '),
    "data-selected": selected ? 'true' : 'false',
    "aria-pressed": selected
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "select-card__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "select-card__title"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "select-card__check"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "icon",
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  })))), description ? /*#__PURE__*/React.createElement("p", {
    className: "select-card__desc"
  }, description) : null, children, tags.length ? /*#__PURE__*/React.createElement("div", {
    className: "select-card__tags"
  }, tags.map((t, i) => {
    const label = typeof t === 'string' ? t : t.label;
    const variant = typeof t === 'string' ? 'default' : t.variant || 'default';
    const cls = ['badge', variant !== 'default' ? 'badge--' + variant : ''].filter(Boolean).join(' ');
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      className: cls
    }, label);
  })) : null);
}
Object.assign(__ds_scope, { SelectableCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/SelectableCard/SelectableCard.jsx", error: String((e && e.message) || e) }); }

// components/Sidebar/Sidebar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SidebarBrand({
  logo = 'S',
  name,
  sub,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['sidebar__brand', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "sidebar__logo"
  }, logo), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sidebar__brand-name"
  }, name), sub ? /*#__PURE__*/React.createElement("div", {
    className: "sidebar__brand-sub"
  }, sub) : null));
}
function NavItem({
  icon = null,
  active = false,
  accent = false,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['nav-item', className].filter(Boolean).join(' '),
    "data-active": active ? 'true' : 'false',
    "data-accent": accent ? 'true' : 'false'
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    className: "nav-item__icon"
  }, icon) : null, /*#__PURE__*/React.createElement("span", null, children));
}
function NavSection({
  heading,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['sidebar__group', className].filter(Boolean).join(' ')
  }, rest), heading ? /*#__PURE__*/React.createElement("div", {
    className: "sidebar__heading"
  }, heading) : null, children);
}
function Sidebar({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("aside", _extends({
    className: ['sidebar', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Sidebar, SidebarBrand, NavItem, NavSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Sidebar/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/StatCard/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function StatCard({
  label,
  value,
  sub,
  icon = null,
  mono = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['stat-card', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "stat-card__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-card__label"
  }, label), icon ? /*#__PURE__*/React.createElement("span", {
    className: "stat-card__icon"
  }, icon) : null), /*#__PURE__*/React.createElement("div", {
    className: 'stat-card__value' + (mono ? ' stat-card__value--mono' : '')
  }, value), sub ? /*#__PURE__*/React.createElement("div", {
    className: "stat-card__sub"
  }, sub) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/StatCard/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/Stepper/Stepper.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Stepper({
  step,
  total,
  label,
  percent,
  className = '',
  ...rest
}) {
  const pct = percent != null ? percent : total ? Math.round(step / total * 100) : 0;
  const text = label != null ? label : step != null && total != null ? `Paso ${step} de ${total}` : '';
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['stepper', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "stepper__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stepper__label"
  }, text), /*#__PURE__*/React.createElement("span", {
    className: "stepper__pct"
  }, pct, "%")), /*#__PURE__*/React.createElement("div", {
    className: "stepper__track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stepper__fill",
    style: {
      width: pct + '%'
    }
  })));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Stepper/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/ThemeToggle/ThemeToggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ThemeToggle({
  className = '',
  onToggle,
  ...rest
}) {
  const get = () => typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'dark' : 'dark';
  const [theme, setTheme] = React.useState(get);
  React.useEffect(() => {
    setTheme(get());
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
    if (onToggle) onToggle(next);
  };
  const path = theme === 'dark' ? '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['theme-toggle', className].filter(Boolean).join(' '),
    onClick: toggle,
    "aria-label": theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro',
    title: theme === 'dark' ? 'Modo claro' : 'Modo oscuro'
  }, rest), /*#__PURE__*/React.createElement("svg", {
    className: "icon",
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    "aria-hidden": "true",
    dangerouslySetInnerHTML: {
      __html: path
    }
  }));
}
Object.assign(__ds_scope, { ThemeToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ThemeToggle/ThemeToggle.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.UserPill = __ds_scope.UserPill;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.SelectField = __ds_scope.SelectField;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.SelectableCard = __ds_scope.SelectableCard;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.SidebarBrand = __ds_scope.SidebarBrand;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.NavSection = __ds_scope.NavSection;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.ThemeToggle = __ds_scope.ThemeToggle;

})();
