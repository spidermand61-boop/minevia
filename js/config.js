export const CUSTOM_LIMITS = Object.freeze({ minWidth: 5, maxWidth: 40, minHeight: 5, maxHeight: 30 });
export const DEFAULT_CUSTOM = Object.freeze({ width: 16, height: 16, mines: 40 });
export function validDimensions(width, height) {
  return Number.isInteger(width) && width >= CUSTOM_LIMITS.minWidth && width <= CUSTOM_LIMITS.maxWidth &&
    Number.isInteger(height) && height >= CUSTOM_LIMITS.minHeight && height <= CUSTOM_LIMITS.maxHeight;
}
export function maxCustomMines(width, height) {
  // Any interior first reveal reserves itself and all eight neighbors.
  return validDimensions(width, height) ? width * height - 9 : 0;
}
export function validCustom(config) {
  return Boolean(config && validDimensions(config.width, config.height) && Number.isInteger(config.mines) &&
    config.mines >= 1 && config.mines <= maxCustomMines(config.width, config.height));
}
export const copyCustom = ({ width, height, mines }) => ({ width, height, mines });
