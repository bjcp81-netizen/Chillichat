// ChilliChat voice recorder (Stage 2)
// Records raw audio, builds a 16 kHz mono WAV in the browser, and sends it
// through the existing "voiceClip" socket event. Also burns clips on expiry.
(function () {
  var TARGET_RATE = 16000;
  var MAX_MS = 15000;
  var MIN_MS = 300;
  var SILENCE_PEAK = 0.004;

  var ctx = null;
  var stream = null;
  var source = null;
  var proc = null;
  var chunks = [];
  var recording = false;
  var starting = false;
  var stopRequested = false;
  var cancelRequested = false;
  var startedAt = 0;
  var timer = null;
  var tick = null;
  var handle = "";
  var color = "";

  function $(id) { return document.getElementById(id); }
  function AudioCtor() { return window.AudioContext || window.webkitAudioContext; }

  // iPhones only allow audio after a real tap, so unlock on the first tap.
  function unlock() {
    var A = AudioCtor();
    if (!A) return;
    if (!ctx) ctx = new A();
    if (ctx.state === "suspended" && ctx.resume) {
      ctx.resume().catch(function () {});
    }
  }
  ["click", "touchend", "pointerup", "keydown"].forEach(function (evt) {
    document.addEventListener(evt, unlock, { capture: true, passive: true });
  });

  function soundOn() {
    var t = $("sound-toggle");
    return !t || t.checked;
  }

  function beep(id) {
    if (!soundOn()) return;
    var a = $(id);
    if (!a) return;
    var c = a.cloneNode(true);
    c.play().catch(function () {});
  }

  function showOverlay(on) {
    var o = $("recording-overlay");
    if (o) o.classList.toggle("hidden", !on);
    var m = $("mic-btn");
    if (m) m.classList.toggle("recording", on);
  }

  function updateTimer() {
    var el = $("recording-timer");
    if (!el) return;
    var ms = Date.now() - startedAt;
    el.textContent = (ms / 1000).toFixed(1) + "s / " + (MAX_MS / 1000).toFixed(1) + "s";
  }

  function toast(msg) {
    var box = $("messages-box");
    if (!box) return;
    var p = document.createElement("p");
    p.className = "system-msg";
    p.textContent = msg;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
  }

  function downsample(f32, inRate, outRate) {
    if (inRate <= outRate) return { data: f32, rate: inRate };
    var ratio = inRate / outRate;
    var outLen = Math.floor(f32.length / ratio);
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var s = Math.floor(i * ratio);
      var e = Math.min(f32.length, Math.floor((i + 1) * ratio));
      var sum = 0;
      var n = 0;
      for (var j = s; j < e; j++) { sum += f32[j]; n++; }
      out[i] = n ? sum / n : 0;
    }
    return { data: out, rate: outRate };
  }

  function encodeWav(f32, rate) {
    var buf = new ArrayBuffer(44 + f32.length * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF");
    v.setUint32(4, 36 + f32.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, f32.length * 2, true);
    for (var i = 0; i < f32.length; i++) {
      var s = Math.max(-1, Math.min(1, f32[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  function start(h, c) {
    if (recording || starting) return;
    handle = h;
    color = c;

    if (!AudioCtor() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Voice recording isn't supported in this browser.");
      return;
    }

    unlock();
    starting = true;
    stopRequested = false;
    cancelRequested = false;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      starting = false;
      stream = s;

      if (ctx.state === "suspended" && ctx.resume) {
        ctx.resume().catch(function () {});
      }

      source = ctx.createMediaStreamSource(s);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      chunks = [];
      recording = true;
      startedAt = Date.now();

      proc.onaudioprocess = function (e) {
        if (!recording) return;
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      source.connect(proc);
      proc.connect(ctx.destination);

      showOverlay(true);
      updateTimer();
      tick = setInterval(updateTimer, 200);
      timer = setTimeout(function () { finish(false); }, MAX_MS);
      beep("mic-sound");

      if (stopRequested) finish(cancelRequested);
    }).catch(function (err) {
      starting = false;
      console.error("Mic access error:", err);
      alert("Couldn't access your microphone. Please check permissions.");
    });
  }

  function stop(cancelled) {
    if (starting) {
      stopRequested = true;
      cancelRequested = !!cancelled;
      return;
    }
    if (recording) finish(!!cancelled);
  }

  function finish(isCancel) {
    if (!recording) return;
    recording = false;
    clearTimeout(timer);
    clearInterval(tick);

    try { proc.disconnect(); source.disconnect(); } catch (e) {}
    proc.onaudioprocess = null;
    stream.getTracks().forEach(function (t) { t.stop(); });
    showOverlay(false);

    var ms = Date.now() - startedAt;
    if (isCancel) return;
    beep("send-sound");
    if (ms < MIN_MS) return;

    var total = 0;
    var i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;

    if (total === 0) {
      toast("⚠️ That recording captured no audio. Tap the page once and try again.");
      return;
    }

    var all = new Float32Array(total);
    var pos = 0;
    for (i = 0; i < chunks.length; i++) { all.set(chunks[i], pos); pos += chunks[i].length; }
    chunks = [];

    var ds = downsample(all, ctx.sampleRate, TARGET_RATE);

    var peak = 0;
    for (i = 0; i < ds.data.length; i++) {
      var a = Math.abs(ds.data[i]);
      if (a > peak) peak = a;
    }
    if (peak < SILENCE_PEAK) {
      toast("⚠️ That recording was silent. Check your microphone and try again.");
      return;
    }

    var durationMs = Math.min(Math.round((ds.data.length / ds.rate) * 1000), MAX_MS);
    var blob = encodeWav(ds.data, ds.rate);
    var reader = new FileReader();

    reader.onloadend = function () {
      var sock = window.chilliSocket;
      if (!sock) {
        toast("⚠️ Not connected. Clip not sent.");
        return;
      }
      sock.emit("voiceClip", {
        handle: handle,
        color: color,
        audioData: reader.result,
        durationMs: durationMs,
      });
    };
    reader.readAsDataURL(blob);
  }

  // Stop if the mouse slides off the mic button while held (desktop).
  document.addEventListener("DOMContentLoaded", function () {
    var m = $("mic-btn");
    if (m) {
      m.addEventListener("mouseleave", function () {
        if (recording) finish(false);
      });
    }
  });

  // Burn animation when the server says a clip has expired.
  function waitForSocket(cb) {
    if (window.chilliSocket) cb(window.chilliSocket);
    else setTimeout(function () { waitForSocket(cb); }, 50);
  }

  waitForSocket(function (socket) {
    socket.on("voiceClipExpired", function (data) {
      var el = document.querySelector('[data-clip-id="' + data.clipId + '"]');
      if (!el || el.classList.contains("burning")) return;

      el.classList.add("burning");
      var done = false;

      function burnedOut() {
        if (done) return;
        done = true;
        el.innerHTML = "";
        el.className = "system-msg";
        el.textContent = "🔥 Voice clip burned away";
      }

      el.addEventListener("animationend", burnedOut, { once: true });
      setTimeout(burnedOut, 1500);
    });
  });

  window.ChilliVoice = { start: start, stop: stop };
})();
