const OK_SRC = "/sounds/bin-ok.mp3";
const ERR_SRC = "/sounds/bin-err.mp3";

function playSrc(src: string) {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(src);
    audio.volume = 1;
    void audio.play().catch(() => {
      /* autoplay may block until a user gesture; ignore */
    });
  } catch {
    /* ignore missing/decode errors */
  }
}

let okPreload: HTMLAudioElement | null = null;
let errPreload: HTMLAudioElement | null = null;

export function preloadBinSounds() {
  if (typeof window === "undefined") return;
  if (!okPreload) {
    okPreload = new Audio(OK_SRC);
    okPreload.preload = "auto";
    okPreload.volume = 1;
  }
  if (!errPreload) {
    errPreload = new Audio(ERR_SRC);
    errPreload.preload = "auto";
    errPreload.volume = 1;
  }
}

export function playBinOk() {
  preloadBinSounds();
  playSrc(OK_SRC);
}

export function playBinErr() {
  preloadBinSounds();
  playSrc(ERR_SRC);
}
