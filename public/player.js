const AudioEngine = {
  player: null,
  isRinging: false,
  wakeLock: null,

  async init() {
    console.log("🔊 AudioEngine INIT");

    // 🔆 KEEP SCREEN AWAKE (Android)
    this.requestWakeLock();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.requestWakeLock();
      }
    });

    // 🎵 AUDIO PLAYER
    if (!this.player) {
      this.player = document.createElement("audio");
      this.player.loop = true;
      this.player.volume = 1.0;
      this.player.src = "tone19hz.wav";
      document.body.appendChild(this.player);
    }

    // ▶️ START BACKGROUND TONE
    try {
      await this.player.play();
      this.setIdleMetadata();
    } catch {
      console.log("⏳ Waiting for user interaction");
    }

    this.setupMediaSession();
  },

  async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      console.log("🔆 Wake Lock ACTIVE");
    } catch (e) {}
  },

  setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    const accept = () => {
      if (this.isRinging) {
        console.log("✅ ACCEPT via Media Button");
        this.stopAlarm();
      }
    };

    ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach(a => {
      navigator.mediaSession.setActionHandler(a, accept);
    });
  },

  // 🚨 TRIGGER ALARM
  async triggerAlarm() {
    if (this.isRinging) return;

    this.isRinging = true;
    console.log("🚨 ALARM");

    this.player.src = "alert.mp3";
    this.player.loop = true;

    try {
      await this.player.play();
    } catch {}

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "🚨 ΚΛΗΣΗ",
        artist: "Play / Pause = Αποδοχή",
        album: "BellGo",
        artwork: [{
          src: "https://cdn-icons-png.flaticon.com/512/564/564619.png",
          sizes: "512x512",
          type: "image/png"
        }]
      });
    }

    if (navigator.vibrate) {
      navigator.vibrate([800, 400, 800]);
    }
  },

  // 🛑 STOP / ACCEPT
  async stopAlarm() {
    if (!this.isRinging) return;

    console.log("🛑 ALARM STOP");
    this.isRinging = false;

    this.player.src = "tone19hz.wav";
    this.player.loop = true;

    try {
      await this.player.play();
    } catch {}

    this.setIdleMetadata();
    if (navigator.vibrate) navigator.vibrate(0);
  },

  setIdleMetadata() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: "🟢 BellGo Online",
      artist: "Standby",
      album: "BellGo"
    });

    navigator.mediaSession.playbackState = "playing";
  }
};

window.AudioEngine = AudioEngine;
