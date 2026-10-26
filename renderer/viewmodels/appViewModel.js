// Which view is on screen: the Arduino lab's bench, the project map or the git branches. Each view keeps its own camera,
// so switching back and forth returns to where you were.
import { Observable } from '../core/observable.js';
import { CAMERA } from './cameraViewModel.js';

export const VIEWS = ['lab', 'map', 'git'];
// The bench starts centered on its origin, a little closer than the map (parts are small)
const LAB_START = { target: { x: 0, z: 0 }, zoom: 1.6 };

export class AppViewModel {
  #camera;
  #gitModel;
  #gitViewModel;
  #savedCamera = {}; // view -> { target, zoom, azimuth }

  store = new Observable({ view: 'map' });

  constructor({ camera, gitModel, gitViewModel }) {
    this.#camera = camera;
    this.#gitModel = gitModel;
    this.#gitViewModel = gitViewModel;
  }

  get view() {
    return this.store.state.view;
  }

  setView(view) {
    if (!VIEWS.includes(view) || view === this.view) return;
    this.#savedCamera[this.view] = { ...this.#camera.saveView(), azimuth: this.#camera.azimuthGoal };

    const saved = this.#savedCamera[view];
    if (saved) {
      this.#camera.restoreView(saved);
      this.#camera.azimuthGoal = saved.azimuth;
    } else if (view === 'lab') {
      this.#camera.restoreView(LAB_START);
    } else if (view === 'git') {
      this.#camera.azimuthGoal = CAMERA.gitAzimuth;
      this.#gitViewModel.centerOnHead();
    }
    if (view === 'git') this.#gitModel.load(); // always show fresh history
    this.store.set({ view });
  }

  toggle() {
    this.setView(this.view === 'map' ? 'git' : 'map');
  }

  // A new project starts both views from scratch
  resetCameras() {
    this.#savedCamera = {};
  }
}
