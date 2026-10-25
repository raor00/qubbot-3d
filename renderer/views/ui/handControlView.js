// The hand button in the map controls and, while it is on, a small mirrored camera preview with what the
// hand is doing (or why the camera could not start), a "?" with the gestures and, in dev, the frame rate.
import { strings } from '../../i18n/es.js';

// The camera card is shared with the hands-free control (views/ui/handsFreeView.js): it shows while either is on
export function syncPreview(preview) {
  preview.hidden = preview.dataset.hands !== 'on' && preview.dataset.handsFree !== 'on';
}

// dev: show frames per second and GPU / CPU (npm run dev)
export function createHandControlView({ handControlViewModel: vm, video, dev = false }) {
  const button = document.getElementById('hand-control');
  const preview = document.getElementById('hand-preview');
  const status = preview.querySelector('.hand-status');
  const helpButton = preview.querySelector('.hand-help-button');
  const help = preview.querySelector('.hand-help');
  const fps = preview.querySelector('.hand-fps');
  preview.querySelector('.hand-video').append(video);
  const H = strings.hands;

  button.addEventListener('click', () => vm.toggle());

  // The gestures, folded under the "?"
  help.replaceChildren(
    Object.assign(document.createElement('strong'), { textContent: H.helpTitle }),
    ...H.helpItems.map((item) => Object.assign(document.createElement('p'), { textContent: item })),
  );
  helpButton.setAttribute('aria-label', H.help);
  helpButton.title = H.help;
  helpButton.addEventListener('click', () => {
    help.hidden = !help.hidden;
    helpButton.setAttribute('aria-expanded', String(!help.hidden));
  });

  const describe = ({ status: s, error, hand, pinching, gesture, ring, selected }) => {
    if (s === 'error') return H.errors[error];
    if (s === 'starting') return H.starting;
    if (gesture && gesture.startsWith('zoom')) return H.zoom[gesture];
    if (gesture === 'wait') return H.waitRelease;
    if (pinching) return H.pinching[gesture ?? 'grab'];
    if (selected) return H.selected(selected);
    if (gesture === 'point') return ring > 0 ? H.holding : H.pointing;
    if (hand) return H.open;
    return H.noHand;
  };

  vm.store.subscribe((state) => {
    const { status: s, hand, pinching, gesture, twoHands } = state;
    button.setAttribute('aria-pressed', String(s === 'on' || s === 'starting'));
    preview.dataset.hands = s === 'off' ? 'off' : 'on';
    syncPreview(preview);
    preview.classList.toggle('error', s === 'error');
    preview.classList.toggle('hand', hand);
    preview.classList.toggle('pinching', pinching || Boolean(gesture?.startsWith('zoom')));
    status.textContent = describe(state);
    // On a slow CPU the two-hand zoom turns off: say it once, under the status
    preview.classList.toggle('slow', s === 'on' && !twoHands);
    preview.querySelector('.hand-slow').textContent = s === 'on' && !twoHands ? H.slow : '';
    fps.hidden = !dev || s !== 'on';
    if (dev) fps.textContent = H.fps(state.fps, state.delegate);
  }, { immediate: true });
}
