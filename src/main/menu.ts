import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';

/**
 * Menú de clic derecho: Cortar/Copiar/Pegar en campos de texto y Copiar sobre texto
 * seleccionado. Se engancha a la ventana principal (no a los reproductores embebidos).
 */
export function attachContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    const hasSelection = selectionText.trim().length > 0;
    if (!isEditable && !hasSelection) return;

    const items: MenuItemConstructorOptions[] = isEditable
      ? [
          { label: 'Deshacer', role: 'undo', enabled: editFlags.canUndo },
          { label: 'Rehacer', role: 'redo', enabled: editFlags.canRedo },
          { type: 'separator' },
          { label: 'Cortar', role: 'cut', enabled: editFlags.canCut },
          { label: 'Copiar', role: 'copy', enabled: editFlags.canCopy },
          { label: 'Pegar', role: 'paste', enabled: editFlags.canPaste },
          { type: 'separator' },
          { label: 'Seleccionar todo', role: 'selectAll', enabled: editFlags.canSelectAll },
        ]
      : [{ label: 'Copiar', role: 'copy' }];
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // Sin este menú, en macOS no funcionan ⌘C / ⌘V / ⌘X / ⌘A / ⌘Z dentro de la app
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Pegar sin formato', role: 'pasteAndMatchStyle' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Forzar Recarga', role: 'forceReload' },
        { label: 'Herramientas de Desarrollador', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Restablecer Zoom', role: 'resetZoom' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Pantalla Completa', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { label: 'Minimizar', role: 'minimize' },
        { label: 'Cerrar', role: 'close' },
        ...(isMac ? [{ type: 'separator' as const }, { label: 'Traer al frente', role: 'front' as const }] : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
