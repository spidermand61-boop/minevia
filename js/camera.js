export const BASE_CELL_SIZE = 44;
export const CELL_GAP = 3;
export const BOARD_PADDING = 9;
export const VIEW_PADDING = 12;
export const MAX_SCALE = 2.5;
export const ZOOM_STEP = 1.2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const positive = v => Number.isFinite(v) && v > 0;

// Camera coordinates are CSS pixels. Board geometry and game state never scale.
export class Camera {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.boardWidth = cols * BASE_CELL_SIZE + (cols - 1) * CELL_GAP + 2 * BOARD_PADDING;
    this.boardHeight = rows * BASE_CELL_SIZE + (rows - 1) * CELL_GAP + 2 * BOARD_PADDING;
    this.width = 0; this.height = 0;
    this.scale = 1; this.minScale = 1; this.maxScale = MAX_SCALE;
    this.offsetX = 0; this.offsetY = 0; this.manual = false;
  }
  get valid() { return positive(this.width) && positive(this.height); }
  resize(width, height) {
    if (!positive(width) || !positive(height)) return false;
    const center = this.valid ? this.toWorld(this.width / 2, this.height / 2) : null;
    this.width = width; this.height = height;
    // Keep padding proportional in exceptionally tiny/transient containers.
    this.padding = Math.min(VIEW_PADDING, width / 4, height / 4);
    this.minScale = Math.min(1, (width - 2 * this.padding) / this.boardWidth,
      (height - 2 * this.padding) / this.boardHeight);
    if (!this.manual || !center) this.fit();
    else {
      this.scale = clamp(this.scale, this.minScale, this.maxScale);
      this.offsetX = width / 2 - center.x * this.scale;
      this.offsetY = height / 2 - center.y * this.scale;
      this.clamp();
    }
    return true;
  }
  toWorld(x, y) { return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale }; }
  fit() {
    if (!this.valid) return;
    this.manual = false; this.scale = this.minScale;
    this.offsetX = (this.width - this.boardWidth * this.scale) / 2;
    this.offsetY = (this.height - this.boardHeight * this.scale) / 2;
  }
  clamp() {
    if (!this.valid) return;
    const axis = (offset, size, view) => size <= view - 2 * this.padding
      ? (view - size) / 2 : clamp(offset, view - this.padding - size, this.padding);
    this.offsetX = axis(this.offsetX, this.boardWidth * this.scale, this.width);
    this.offsetY = axis(this.offsetY, this.boardHeight * this.scale, this.height);
  }
  place(scale, world, screen) {
    if (!this.valid || !positive(scale) || ![world.x, world.y, screen.x, screen.y].every(Number.isFinite)) return;
    this.manual = true; this.scale = clamp(scale, this.minScale, this.maxScale);
    this.offsetX = screen.x - world.x * this.scale;
    this.offsetY = screen.y - world.y * this.scale;
    this.clamp();
  }
  zoom(factor, x = this.width / 2, y = this.height / 2) {
    if (!positive(factor)) return;
    this.place(this.scale * factor, this.toWorld(x, y), { x, y });
  }
  pan(dx, dy) {
    if (!this.valid || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.manual = true; this.offsetX += dx; this.offsetY += dy; this.clamp();
  }
  hit(x, y) {
    if (!this.valid || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    const p = this.toWorld(x, y), pitch = BASE_CELL_SIZE + CELL_GAP;
    const bx = p.x - BOARD_PADDING, by = p.y - BOARD_PADDING;
    if (bx < 0 || by < 0) return -1;
    const col = Math.floor(bx / pitch), row = Math.floor(by / pitch);
    if (col >= this.cols || row >= this.rows || bx % pitch >= BASE_CELL_SIZE || by % pitch >= BASE_CELL_SIZE) return -1;
    return row * this.cols + col;
  }
  ensureVisible(index) {
    const pitch = BASE_CELL_SIZE + CELL_GAP;
    const x = this.offsetX + (BOARD_PADDING + (index % this.cols) * pitch) * this.scale;
    const y = this.offsetY + (BOARD_PADDING + Math.floor(index / this.cols) * pitch) * this.scale;
    const side = BASE_CELL_SIZE * this.scale, pad = this.padding;
    const delta = (start, view) => start < pad ? pad - start : start + side > view - pad ? view - pad - start - side : 0;
    const dx = delta(x, this.width), dy = delta(y, this.height);
    if (dx || dy) this.pan(dx, dy);
  }
}
