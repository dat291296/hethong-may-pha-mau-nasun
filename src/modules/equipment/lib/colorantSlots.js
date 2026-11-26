import { normalizeOptionalSerial } from './deviceSerial.js';
import { resolveEquipmentSlot } from './equipmentReplacement.js';

// Screen swatches are approximate. Source: CCA NovoColor II technical data.
export const COLORANTS = {
  AXX: ['Vàng hữu cơ', '#f0ce30'], B: ['Đen', '#232323'], C: ['Vàng oxit', '#b78335'],
  D: ['Xanh lục', '#126343'], E: ['Xanh lam', '#12477e'], F: ['Đỏ oxit', '#944933'],
  I: ['Nâu oxit', '#6e4034'], AN: ['Vàng bền', '#e5ae35'], KX: ['Trắng', '#fafafa'],
  L: ['Nâu umber', '#60503d'], RR: ['Đỏ', '#c92c34'], RH: ['Đỏ', '#b82e30'],
  T: ['Vàng trung', '#efb52d'], V: ['Đỏ cánh sen', '#af2868'],
};

export const supportsColorantSlots = model => /^sa(?:n)?tint[ -]+a2(?:[ -]100)?$/i.test(String(model || '').trim());
export function validColorantSlots(slots) {
  return Array.isArray(slots) && slots.length === 14 && new Set(slots).size === 14 &&
    slots.every(code => Object.hasOwn(COLORANTS, code));
}

export function colorantDevice(machine, dispensers) {
  const { device } = resolveEquipmentSlot(machine, 'dispenser', dispensers);
  const serial = normalizeOptionalSerial(device?.serial);
  const expected = normalizeOptionalSerial(machine.dispenserSerial);
  if (!serial || (expected && expected.toUpperCase() !== serial.toUpperCase())) return null;
  const matches = dispensers.filter(row => normalizeOptionalSerial(row.serial)?.toUpperCase() === serial.toUpperCase());
  return matches.length === 1 ? device : null;
}

