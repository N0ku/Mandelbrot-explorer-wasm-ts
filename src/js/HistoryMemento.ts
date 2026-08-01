export interface FractalState {
  zoom: number;
  panX: number;
  panY: number;
}

export class HistoryManager {
  private states: FractalState[] = [];
  private currentIndex: number = -1;
  // Limit history size
  private maxSize: number = 50;

  saveState(state: FractalState): void {
    if (this.currentIndex < this.states.length - 1) {
      this.states = this.states.slice(0, this.currentIndex + 1);
    }

    const lastState = this.states[this.currentIndex];
    if (
      !lastState ||
      lastState.zoom !== state.zoom ||
      lastState.panX !== state.panX ||
      lastState.panY !== state.panY
    ) {
      this.states.push({ ...state });
      this.currentIndex++;

      if (this.states.length > this.maxSize) {
        this.states.shift();
        this.currentIndex--;
      }
    }
  }

  hasNext(): boolean {
    return this.currentIndex < this.states.length - 1;
  }

  hasPrevious(): boolean {
    return this.currentIndex > 0;
  }

  getNextState(): FractalState | null {
    if (!this.hasNext()) return null;
    return this.states[++this.currentIndex];
  }

  getPreviousState(): FractalState | null {
    if (!this.hasPrevious()) return null;
    return this.states[--this.currentIndex];
  }
}
