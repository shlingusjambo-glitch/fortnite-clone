// The page is just the engine canvas: every menu and HUD element is drawn by the engine (see eui.ts).
export function mountUi() {
  const st = document.createElement('style');
  st.textContent = 'html,body{background:#080a0f;user-select:none;-webkit-user-select:none}#vapour-game{cursor:default;touch-action:none}';
  document.head.appendChild(st);
}
