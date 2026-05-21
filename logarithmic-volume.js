// NAME: Logarithmic Volume
// VERSION: 0.1.0
// DESCRIPTION: Replace Spotify's volume bar with a power-curve volume slider for finer low-volume control.

(function logarithmicVolume() {
  const EXTENSION_NAME = "Logarithmic Volume";
  const CURVE_POWER = 2;
  const RANGE_MAX = 1000;
  const SYNC_INTERVAL_MS = 500;
  const VOLUME_SLIDER_WAIT_TIMEOUT_MS = 15000;
  const PLAYER_VOLUME_DEBOUNCE_MS = 25;
  const PLAYER_VOLUME_MAX_WAIT_MS = 50;
  const VOLUME_SLIDER_HOST_SELECTOR =
    ".main-nowPlayingBar-extraControls .main-nowPlayingBar-volumeBar .playback-progressbar";
  const STYLE_ID = "logarithmic-volume-styles";
  const ATTACHED_CLASS = "logarithmic-volume-attached";
  const SLIDER_CLASS = "logarithmic-volume-slider";
  const TRACK_CLASS = "logarithmic-volume-track";
  const FILL_CLASS = "logarithmic-volume-fill";
  const THUMB_CLASS = "logarithmic-volume-thumb";
  const DRAGGING_CLASS = "logarithmic-volume-dragging";

  const Spicetify = globalThis.Spicetify;
  let attachInProgress = false;
  let didLogVolumeSetError = false;
  let reattachObserverStarted = false;
  let syncIntervalId = null;

  if (!Spicetify?.Player?.getVolume || !Spicetify?.Platform?.PlaybackAPI?.setVolume) {
    setTimeout(logarithmicVolume, 100);
    return;
  }

  function clamp(value, min = 0, max = 1) {
    return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
  }

  function curve(uiValue) {
    return Math.pow(clamp(uiValue), CURVE_POWER);
  }

  function inverseCurve(volume) {
    return Math.pow(clamp(volume), 1 / CURVE_POWER);
  }

  function setSliderFill(slider) {
    const percent = getSliderUiValue(slider) * 100;
    slider.style.setProperty("--logarithmic-volume-fill", `${percent}%`);
    slider.setAttribute("aria-valuenow", String(Math.round(percent)));
    slider.setAttribute("aria-valuetext", `${Math.round(percent)}%`);
  }

  function getSliderValueFromPlayer() {
    return Math.round(inverseCurve(getPlayerVolume()) * RANGE_MAX);
  }

  function getSliderUiValue(slider) {
    return clamp(Number(slider.dataset.value || 0) / RANGE_MAX);
  }

  function setSliderUiValue(slider, uiValue) {
    slider.dataset.value = String(Math.round(clamp(uiValue) * RANGE_MAX));
    setSliderFill(slider);
  }

  function syncSliderFromPlayer(slider) {
    const nextValue = getSliderValueFromPlayer();

    if (slider.dataset.value !== String(nextValue)) {
      slider.dataset.value = String(nextValue);
    }

    setSliderFill(slider);
  }

  function getPlayerVolume() {
    // Spotify's native volume component reads the cached PlaybackAPI volume first.
    const volume = Spicetify.Platform.PlaybackAPI._volume ?? Spicetify.Player.getVolume();
    return Number.isFinite(volume) ? volume : 0;
  }

  function setPlayerVolume(volume) {
    Promise.resolve(Spicetify.Platform.PlaybackAPI.setVolume(clamp(volume)))
      .then(() => {
        didLogVolumeSetError = false;
      })
      .catch((error) => {
        if (didLogVolumeSetError) return;

        didLogVolumeSetError = true;
        console.error(`${EXTENSION_NAME} could not set volume`, error);
      });
  }

  function createDebouncedVolumeSetter() {
    let timeoutId = null;
    let maxWaitTimeoutId = null;
    let latestVolume = null;
    let hasPendingVolume = false;

    function clearTimers() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (maxWaitTimeoutId) {
        clearTimeout(maxWaitTimeoutId);
        maxWaitTimeoutId = null;
      }
    }

    function commit() {
      if (!hasPendingVolume) {
        clearTimers();
        return;
      }

      const volume = latestVolume;
      latestVolume = null;
      hasPendingVolume = false;
      clearTimers();
      setPlayerVolume(volume);
    }

    return {
      schedule(volume) {
        latestVolume = volume;

        if (!timeoutId && !maxWaitTimeoutId) {
          setPlayerVolume(volume);
          latestVolume = null;
          hasPendingVolume = false;
          timeoutId = setTimeout(commit, PLAYER_VOLUME_DEBOUNCE_MS);
          maxWaitTimeoutId = setTimeout(commit, PLAYER_VOLUME_MAX_WAIT_MS);
          return;
        }

        hasPendingVolume = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(commit, PLAYER_VOLUME_DEBOUNCE_MS);
      },
      flush(volume) {
        latestVolume = volume;
        hasPendingVolume = true;
        commit();
      },
      cancel() {
        latestVolume = null;
        hasPendingVolume = false;
        clearTimers();
      },
    };
  }

  function getMappedVolumeFromSlider(slider) {
    return curve(getSliderUiValue(slider));
  }

  function getUiValueFromPointer(slider, event) {
    const rect = slider.getBoundingClientRect();
    return rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width) : 0;
  }

  function createSlider() {
    const slider = document.createElement("div");
    const track = document.createElement("div");
    const fill = document.createElement("div");
    const thumb = document.createElement("div");

    slider.className = SLIDER_CLASS;
    slider.tabIndex = 0;
    slider.setAttribute("role", "slider");
    slider.setAttribute("aria-label", `${EXTENSION_NAME} slider`);
    slider.setAttribute("aria-valuemin", "0");
    slider.setAttribute("aria-valuemax", "100");
    slider.title = `${EXTENSION_NAME} (${CURVE_POWER}x curve)`;

    track.className = TRACK_CLASS;
    fill.className = FILL_CLASS;
    thumb.className = THUMB_CLASS;
    track.append(fill, thumb);
    slider.append(track);

    slider.dataset.value = String(getSliderValueFromPlayer());
    setSliderFill(slider);
    return slider;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} {
        position: relative;
      }

      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} > :not(.${SLIDER_CLASS}) {
        display: none !important;
      }

      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .x-progressBar-progressBarBg,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .x-progressBar-sliderArea,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .x-progressBar-fillColor,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .x-progressBar-progressFillColor,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .progress-bar__slider,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} .hidden-visually,
      ${VOLUME_SLIDER_HOST_SELECTOR}.${ATTACHED_CLASS} input[type="range"] {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }

      .${SLIDER_CLASS} {
        --logarithmic-volume-fill: 0%;
        position: absolute;
        inset: 50% 0 auto 0;
        z-index: 100;
        width: 100%;
        height: 12px;
        margin: 0;
        transform: translateY(-50%);
        appearance: none;
        background: transparent;
        border: 0;
        border-radius: 0;
        cursor: pointer;
        outline: none;
        touch-action: none;
      }

      .${TRACK_CLASS} {
        position: absolute;
        inset: 50% 0 auto 0;
        height: 4px;
        overflow: visible;
        transform: translateY(-50%);
        background: #ffffff4d;
        border-radius: 2px;
      }

      .${FILL_CLASS} {
        width: var(--logarithmic-volume-fill);
        height: 100%;
        background: var(--spice-text, #fff);
        border-radius: 2px;
      }

      .${THUMB_CLASS} {
        position: absolute;
        top: 50%;
        left: var(--logarithmic-volume-fill);
        width: 12px;
        height: 12px;
        margin-left: -6px;
        transform: translateY(-50%);
        background: var(--spice-text, #fff);
        border-radius: 50%;
        box-shadow: 0 2px 4px #00000080;
        opacity: 0;
      }

      .${SLIDER_CLASS}:hover .${FILL_CLASS},
      .${SLIDER_CLASS}:focus-visible .${FILL_CLASS},
      .${SLIDER_CLASS}.${DRAGGING_CLASS} .${FILL_CLASS} {
        background: var(--spice-button, #1ed760);
      }

      .${SLIDER_CLASS}:hover .${THUMB_CLASS},
      .${SLIDER_CLASS}:focus-visible .${THUMB_CLASS},
      .${SLIDER_CLASS}.${DRAGGING_CLASS} .${THUMB_CLASS} {
        opacity: 1;
      }
    `;

    document.body.append(style);
  }

  function waitForVolumeSliderHost() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(VOLUME_SLIDER_HOST_SELECTOR);

      if (existing) {
        resolve(existing);
        return;
      }

      let observer = null;
      const timeoutId = setTimeout(() => {
        observer?.disconnect();
        reject(new Error(`${EXTENSION_NAME} could not find Spotify's volume slider host`));
      }, VOLUME_SLIDER_WAIT_TIMEOUT_MS);

      function resolveHost(volumeSliderHost) {
        clearTimeout(timeoutId);
        observer?.disconnect();
        resolve(volumeSliderHost);
      }

      observer = new MutationObserver(() => {
        const volumeSliderHost = document.querySelector(VOLUME_SLIDER_HOST_SELECTOR);

        if (!volumeSliderHost) return;

        resolveHost(volumeSliderHost);
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  function startSyncInterval(slider, isUserSliding) {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }

    syncIntervalId = setInterval(() => {
      if (!isUserSliding() && document.body.contains(slider)) {
        syncSliderFromPlayer(slider);
      }
    }, SYNC_INTERVAL_MS);
  }

  async function attach() {
    if (attachInProgress) return;

    attachInProgress = true;
    const volumeSliderHost = await waitForVolumeSliderHost();

    volumeSliderHost.querySelectorAll(`.${SLIDER_CLASS}`).forEach((staleSlider) => {
      staleSlider.remove();
    });

    addStyles();

    const slider = createSlider();
    const setDebouncedVolume = createDebouncedVolumeSetter();
    let userIsSliding = false;

    function updateFromPointer(event, options = {}) {
      setSliderUiValue(slider, getUiValueFromPointer(slider, event));

      if (options.flush) {
        setDebouncedVolume.flush(getMappedVolumeFromSlider(slider));
        return;
      }

      setDebouncedVolume.schedule(getMappedVolumeFromSlider(slider));
    }

    slider.addEventListener("pointerdown", (event) => {
      userIsSliding = true;
      slider.classList.add(DRAGGING_CLASS);
      slider.setPointerCapture(event.pointerId);
      updateFromPointer(event);
    });
    slider.addEventListener("pointermove", (event) => {
      if (!userIsSliding) return;

      updateFromPointer(event);
    });
    slider.addEventListener("pointerup", (event) => {
      updateFromPointer(event, { flush: true });
      userIsSliding = false;
      slider.classList.remove(DRAGGING_CLASS);
      if (slider.hasPointerCapture?.(event.pointerId)) {
        slider.releasePointerCapture(event.pointerId);
      }
    });
    slider.addEventListener("pointercancel", () => {
      setDebouncedVolume.cancel();
      userIsSliding = false;
      slider.classList.remove(DRAGGING_CLASS);
      syncSliderFromPlayer(slider);
    });
    slider.addEventListener("keydown", (event) => {
      const currentValue = getSliderUiValue(slider);
      const keySteps = {
        ArrowLeft: -0.01,
        ArrowDown: -0.01,
        ArrowRight: 0.01,
        ArrowUp: 0.01,
        PageDown: -0.1,
        PageUp: 0.1,
      };

      if (event.key === "Home") {
        event.preventDefault();
        setSliderUiValue(slider, 0);
      } else if (event.key === "End") {
        event.preventDefault();
        setSliderUiValue(slider, 1);
      } else if (keySteps[event.key]) {
        event.preventDefault();
        setSliderUiValue(slider, currentValue + keySteps[event.key]);
      } else {
        return;
      }

      setDebouncedVolume.flush(getMappedVolumeFromSlider(slider));
    });
    slider.addEventListener("blur", () => {
      userIsSliding = false;
      syncSliderFromPlayer(slider);
    });

    volumeSliderHost.classList.add(ATTACHED_CLASS);
    volumeSliderHost.append(slider);

    startSyncInterval(slider, () => userIsSliding);

    console.log(`${EXTENSION_NAME} loaded`);
    attachInProgress = false;
  }

  function startReattachObserver() {
    if (reattachObserverStarted) return;

    reattachObserverStarted = true;
    const observer = new MutationObserver(() => {
      const volumeSliderHost = document.querySelector(VOLUME_SLIDER_HOST_SELECTOR);

      if (volumeSliderHost && !volumeSliderHost.querySelector(`.${SLIDER_CLASS}`)) {
        attach().catch(reportError);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function reportError(error) {
    attachInProgress = false;
    Spicetify.showNotification(`${EXTENSION_NAME} failed to load`);
    console.error(error);
  }

  attach()
    .then(startReattachObserver)
    .catch((error) => {
      reportError(error);
      startReattachObserver();
    });
})();
