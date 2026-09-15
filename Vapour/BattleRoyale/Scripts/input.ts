// Engine input: one action map for keyboard, mouse and gamepad. Gameplay asks for verbs (Fire, Build, Wall…),
// never for key codes, so rebinding is a settings concern and controllers need no parallel code path.
import { InputActions, type ActionMapDefinition, type InputBinding } from '@vapour/engine';

const kb = (code: string, scale = 1): InputBinding => ({ device: 'keyboard', code, scale });
const mb = (button: number): InputBinding => ({ device: 'pointer', button });
const gb = (index: number): InputBinding => ({ device: 'gamepad', gamepad: 0, control: 'button', index });
const ga = (index: number, scale = 1): InputBinding => ({ device: 'gamepad', gamepad: 0, control: 'axis', index, scale, deadZone: 0.16 });
const button = (name: string, ...bindings: InputBinding[]) => ({ name, kind: 'button' as const, bindings });

/** Actions the settings page lets players rebind (keyboard/mouse only; pads keep the standard layout). */
export const REBINDABLE: [string, string][] = [['Jump', 'Jump'], ['Sprint', 'Sprint'], ['Crouch', 'Crouch'], ['Fire', 'Fire'], ['Aim', 'Aim / Target'], ['Interact', 'Use / Interact'], ['Reload', 'Reload'], ['Build', 'Build Mode'], ['Edit', 'Edit'], ['Wall', 'Wall'], ['Floor', 'Floor'], ['Ramp', 'Stairs'], ['Pyramid', 'Roof'], ['Pickaxe', 'Harvesting Tool'], ['Map', 'Map'], ['Emote', 'Emote'], ['ThirdPerson', 'Toggle Camera']];

export const GAMEPLAY: ActionMapDefinition = {
  name: 'gameplay',
  actions: [
    { name: 'MoveX', kind: 'axis', bindings: [kb('KeyD'), kb('KeyA', -1), ga(0)] },
    { name: 'MoveY', kind: 'axis', bindings: [kb('KeyW'), kb('KeyS', -1), ga(1, -1)] },
    { name: 'LookX', kind: 'delta', bindings: [{ device: 'pointer', axis: 'x' }] },
    { name: 'LookY', kind: 'delta', bindings: [{ device: 'pointer', axis: 'y' }] },
    { name: 'PadLookX', kind: 'axis', bindings: [ga(2)] }, { name: 'PadLookY', kind: 'axis', bindings: [ga(3)] },
    { name: 'Scroll', kind: 'delta', bindings: [{ device: 'pointer', axis: 'wheelY' }] },
    button('Fire', mb(0), gb(7)), button('Aim', mb(2), gb(6)),
    button('Jump', kb('Space'), gb(0)), button('Sprint', kb('ShiftLeft'), gb(10)), button('Crouch', kb('ControlLeft'), gb(11)),
    button('Build', kb('KeyZ'), gb(1)), button('Edit', kb('KeyX')), button('PadTool', gb(3)),
    button('Interact', kb('KeyE'), gb(2)), button('Reload', kb('KeyR'), gb(2)),
    button('Wall', kb('KeyQ')), button('Floor', kb('KeyG')), button('Ramp', kb('KeyF')), button('Pyramid', kb('AltLeft')),
    button('Pickaxe', kb('Backquote')), button('Slot1', kb('Digit1')), button('Slot2', kb('Digit2')), button('Slot3', kb('Digit3')), button('Slot4', kb('Digit4')), button('Slot5', kb('Digit5')),
    button('PrevSlot', gb(4)), button('NextSlot', gb(5)), button('MatSwap', gb(14)), button('RotateRamp', gb(15)),
    button('Map', kb('KeyM'), gb(12), gb(8)), button('Emote', kb('KeyB'), gb(13)), button('Menu', gb(9)),
    button('Lobby', kb('KeyL')), button('Debug', kb('F8')), button('ThirdPerson', kb('KeyT')),
  ],
  composites: [{ name: 'Move', kind: 'vector2', positiveX: 'MoveX', positiveY: 'MoveY' }],
};

export const IN = new InputActions([GAMEPLAY]);
IN.system.attach(window);
addEventListener('blur', () => IN.system.resetDeviceState());
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => { if (e.code === 'Tab' || /^F\d/.test(e.code) || e.code.startsWith('Alt')) e.preventDefault(); });

/** Keyboard/mouse binding of an action as a short label for the settings page. */
export function bindLabel(action: string): string {
  const b = IN.system.bindings(action).find(x => x.device === 'keyboard' || x.device === 'pointer');
  if (!b) return '—'; if (b.device === 'pointer') return b.button === 0 ? 'LMB' : b.button === 2 ? 'RMB' : b.button === 1 ? 'MMB' : `M${b.button ?? ''}`;
  if (b.device === 'keyboard') return b.code.replace(/^Key|^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Backquote', '`');
  return '—';
}
/** Replaces the keyboard/mouse half of an action's bindings, keeping the pad ones. */
export function rebind(action: string, b: InputBinding) { IN.rebind(action, [b, ...IN.system.bindings(action).filter(x => x.device === 'gamepad')]); }
