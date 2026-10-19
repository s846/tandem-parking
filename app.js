// Tandem: shared, live manual parking tracker. No build tools needed.
// Firebase Realtime Database and Firebase Anonymous Authentication power shared mode.

const $ = (id) => document.getElementById(id);
const VALID_OWNER = new Set(['one', 'two', 'none']);
const ROOM_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const fallbackDrivers = {
  one: { name: 'You', vehicle: 'Your car' },
  two: { name: 'Roommate', vehicle: "Roommate's car" }
};

function newRoomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function getRoomId() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const candidate = hash.get('room');
  if (candidate && ROOM_ID_RE.test(candidate)) return candidate;
  const id = newRoomId();
  history.replaceState(null, '', location.pathname + location.search + '#room=' + id);
  return id;
}
const roomId = getRoomId();
const localKey = 'tandem-room-' + roomId;
const firebaseConfig = window.PARKING_FIREBASE_CONFIG || {};
const isConfigured = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'].every(k =>
  typeof firebaseConfig[k] === 'string' && firebaseConfig[k].trim().length > 0
);

function emptyState() {
  return {
    drivers: structuredClone(fallbackDrivers),
    slots: { front: 'none', back: 'none' },
    updatedAt: 0,
    lastChange: ''
  };
}
function sanitizeLabel(value, fallback, maxLength) {
  return (typeof value === 'string' && value.trim()) ? value.trim().slice(0, maxLength) : fallback;
}
function normalizeState(raw) {
  const fresh = emptyState();
  if (!raw || typeof raw !== 'object') return fresh;
  for (const key of ['one', 'two']) {
    const src = raw.drivers?.[key] || {};
    fresh.drivers[key] = {
      name: sanitizeLabel(src.name, fallbackDrivers[key].name, 40),
      vehicle: sanitizeLabel(src.vehicle, fallbackDrivers[key].vehicle, 45)
    };
  }
  for (const spot of ['front', 'back']) {
    fresh.slots[spot] = VALID_OWNER.has(raw.slots?.[spot]) ? raw.slots[spot] : 'none';
  }
  if (fresh.slots.front !== 'none' && fresh.slots.front === fresh.slots.back) {
    fresh.slots.back = 'none';
  }
  fresh.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  fresh.lastChange = sanitizeLabel(raw.lastChange, '', 100);
  return fresh;
}
function loadLocal() {
  try { return normalizeState(JSON.parse(localStorage.getItem(localKey))); }
  catch { return emptyState(); }
}
let state = isConfigured ? emptyState() : loadLocal();
let connectionMode = isConfigured ? 'loading' : 'demo';
let activeSpot = 'front';
let remoteReady = false;
let remoteRef = null;
let transaction = null;
let toastTimeout;

function setConnection(mode) {
  connectionMode = mode;
  $('connectionPill').className = 'connection-pill ' + mode;
  const labels = { demo: 'Demo mode', loading: 'Connecting…', live: 'Live sync on', error: 'Sync offline' };
  $('connectionText').textContent = labels[mode];
  $('demoBanner').hidden = mode !== 'demo';
  $('errorBanner').hidden = mode !== 'error';
  updateButtonAvailability();
}
function canEdit() { return connectionMode === 'demo' || (connectionMode === 'live' && remoteReady); }
function updateButtonAvailability() {
  const allowed = canEdit();
  for (const id of ['frontSpot', 'backSpot', 'settingsButton', 'editButton']) $(id).disabled = !allowed;
  const any = state.slots.front !== 'none' || state.slots.back !== 'none';
  $('swapButton').disabled = !allowed || !any;
  $('clearButton').disabled = !allowed || !any;
}
function prettyTime(ms) {
  if (!ms) return 'No updates yet';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  return 'Updated ' + new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
function renderSpot(position) {
  const key = state.slots[position];
  const driver = key === 'none' ? null : state.drivers[key];
  $(position + 'Spot').dataset.owner = key;
  $(position + 'State').textContent = driver ? 'PARKED' : 'AVAILABLE';
  $(position + 'Name').textContent = driver ? driver.name : 'Empty spot';
  $(position + 'Vehicle').textContent = driver ? driver.vehicle : 'Tap to add a car';
  $(position + 'Spot').setAttribute('aria-label', `Change ${position === 'front' ? 'garage-side' : 'street-side'} spot: ${driver ? driver.name + ', ' + driver.vehicle : 'empty'}`);
}
function renderSituation() {
  const front = state.slots.front === 'none' ? null : state.drivers[state.slots.front];
  const back = state.slots.back === 'none' ? null : state.drivers[state.slots.back];
  const icon = $('situationIcon');
  icon.classList.toggle('blocked', !!front && !!back);
  if (front && back) {
    icon.textContent = '!';
    const backSubject = back.name === 'You' ? 'You are' : `${back.name} is`;
    const frontObject = front.name === 'You' ? 'you' : front.name;
    $('situationTitle').textContent = `${backSubject} blocking ${frontObject}`;
    $('situationDescription').textContent = `${back.vehicle} is closest to the street, so it must move for ${front.vehicle} to get out.`;
  } else if (front || back) {
    const parked = front || back;
    icon.textContent = '✓';
    $('situationTitle').textContent = 'Exit is clear.';
    const whoseCar = parked.name === 'You' ? 'your car' : `${parked.name}'s car`;
    $('situationDescription').textContent = `Only ${whoseCar} is parked. No car is blocking the exit.`;
  } else {
    icon.textContent = '✓';
    $('situationTitle').textContent = 'All clear.';
    $('situationDescription').textContent = 'Both parking spots are available.';
  }
  $('lastUpdated').textContent = prettyTime(state.updatedAt);
}
function render() {
  renderSpot('front'); renderSpot('back'); renderSituation(); updateButtonAvailability();
}
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}
function explainError(error) {
  console.error('Tandem sync:', error);
  const code = error?.code || '';
  let msg = 'Check your Firebase configuration, database rules, and internet connection.';
  if (code.includes('permission-denied')) msg = 'Permission denied. Publish database.rules.json in Firebase Realtime Database → Rules.';
  if (code.includes('operation-not-allowed')) msg = 'Enable Anonymous sign-in in Firebase Authentication → Sign-in method.';
  if (code.includes('auth/unauthorized-domain')) msg = 'Add this website domain to Firebase Authentication → Settings → Authorized domains.';
  $('errorDetail').textContent = msg;
  setConnection('error');
}
async function writeChange(mutate, successMessage) {
  if (!canEdit()) { toast('Live sync is not ready — no change saved.'); return; }
  try {
    if (!isConfigured) {
      const next = mutate(normalizeState(state));
      if (!next) return;
      next.updatedAt = Date.now();
      state = normalizeState(next);
      localStorage.setItem(localKey, JSON.stringify(state));
      render();
    } else {
      const result = await transaction(remoteRef, current => {
        const next = mutate(normalizeState(current));
        if (!next) return; // abort if nothing changed
        next.updatedAt = Date.now();
        return next;
      }, { applyLocally: false });
      if (!result.committed) return;
    }
    toast(successMessage);
  } catch (error) { explainError(error); toast('Change was not saved.'); }
}
function updateSpot(position, key) {
  if (!VALID_OWNER.has(key)) return;
  const positionLabel = position === 'front' ? 'garage' : 'street';
  const chosenName = key === 'none' ? 'Empty' : state.drivers[key].name;
  writeChange(current => {
    if (current.slots[position] === key) return;
    if (key !== 'none') {
      const other = position === 'front' ? 'back' : 'front';
      if (current.slots[other] === key) current.slots[other] = 'none';
    }
    current.slots[position] = key;
    current.lastChange = key === 'none' ? `Cleared ${positionLabel} spot` : `${chosenName} parked by ${positionLabel}`;
    return current;
  }, key === 'none' ? 'Spot marked empty' : `${chosenName} moved to ${positionLabel} spot`);
}
function openSpotDialog(position) {
  if (!canEdit()) return;
  activeSpot = position;
  $('spotDialogTitle').textContent = position === 'front' ? 'Spot by the garage' : 'Spot by the street';
  $('spotDialogHint').textContent = 'Choose a car or mark this spot empty. A car can only be in one spot at a time.';
  $('choiceOneName').textContent = state.drivers.one.name;
  $('choiceOneVehicle').textContent = state.drivers.one.vehicle;
  $('choiceTwoName').textContent = state.drivers.two.name;
  $('choiceTwoVehicle').textContent = state.drivers.two.vehicle;
  $('spotDialog').showModal();
}
function openSettings() {
  if (!canEdit()) return;
  $('oneNameInput').value = state.drivers.one.name;
  $('oneVehicleInput').value = state.drivers.one.vehicle;
  $('twoNameInput').value = state.drivers.two.name;
  $('twoVehicleInput').value = state.drivers.two.vehicle;
  $('settingsDialog').showModal();
}
for (const position of ['front', 'back']) {
  $(position + 'Spot').addEventListener('click', () => openSpotDialog(position));
}
for (const btn of document.querySelectorAll('[data-choice]')) {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    $('spotDialog').close();
    updateSpot(activeSpot, choice);
  });
}
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => $(btn.dataset.close).close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  });
}
$('settingsButton').addEventListener('click', openSettings);
$('editButton').addEventListener('click', openSettings);
$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = {
    one: { name: $('oneNameInput').value.trim(), vehicle: $('oneVehicleInput').value.trim() },
    two: { name: $('twoNameInput').value.trim(), vehicle: $('twoVehicleInput').value.trim() }
  };
  if (Object.values(values).some(x => !x.name || !x.vehicle)) { toast('Please enter both names and car descriptions.'); return; }
  $('settingsDialog').close();
  writeChange(current => {
    current.drivers = values;
    current.lastChange = 'Updated driver details';
    return current;
  }, 'Driver details saved');
});
$('swapButton').addEventListener('click', () => {
  writeChange(current => {
    const { front, back } = current.slots;
    if (front === 'none' && back === 'none') return;
    current.slots = { front: back, back: front };
    current.lastChange = 'Swapped positions';
    return current;
  }, 'Parking positions swapped');
});
$('clearButton').addEventListener('click', () => $('confirmDialog').showModal());
$('cancelClear').addEventListener('click', () => $('confirmDialog').close());
$('confirmClear').addEventListener('click', () => {
  $('confirmDialog').close();
  writeChange(current => {
    if (current.slots.front === 'none' && current.slots.back === 'none') return;
    current.slots = { front: 'none', back: 'none' };
    current.lastChange = 'Cleared driveway';
    return current;
  }, 'Driveway cleared');
});
$('shareButton').addEventListener('click', async () => {
  if (!isConfigured) { toast('Connect Firebase before sharing — demo mode does not sync.'); return; }
  const link = location.origin + location.pathname + location.search + '#room=' + roomId;
  try {
    await navigator.clipboard.writeText(link);
    toast('Shared driveway link copied!');
  } catch {
    // Fallback for browsers without clipboard API.
    window.prompt('Copy and send this link to your roommate:', link);
  }
});
window.addEventListener('storage', event => {
  if (!isConfigured && event.key === localKey) { state = loadLocal(); render(); }
});

// Firebase is loaded ONLY when config.js has been filled in.
async function startLiveSync() {
  try {
    const version = '12.19.0';
    const [{ initializeApp }, { getAuth, signInAnonymously }, { getDatabase, ref, onValue, runTransaction }] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-database.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app);
    transaction = runTransaction;
    await signInAnonymously(auth);
    remoteRef = ref(db, 'rooms/' + roomId);
    // A transaction prevents two new visitors from overwriting each other's first data.
    await runTransaction(remoteRef, existing => existing === null ? emptyState() : undefined, { applyLocally: false });
    onValue(ref(db, '.info/connected'), snapshot => {
      const online = snapshot.val() === true;
      setConnection(online ? 'live' : 'error');
      if (!online) $('errorDetail').textContent = 'Internet connection lost. Changes are disabled until it reconnects.';
    });
    onValue(remoteRef, snapshot => {
      state = normalizeState(snapshot.val());
      remoteReady = true;
      render();
    }, explainError);
  } catch (error) { explainError(error); }
}
setConnection(connectionMode);
render();
if (isConfigured) startLiveSync();
