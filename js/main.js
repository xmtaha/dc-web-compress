/* eslint-disable no-undef */
/* Discord Video Compressor */

const { FFmpeg } = FFmpegWASM;
const { toBlobURL } = FFmpegUtil;


const WORKER_URL = "./vendor/814.ffmpeg.js";
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

const $ = (id) => document.getElementById(id);
const els = {
  dropZone: $("dropZone"), fileInput: $("fileInput"), dropPrompt: $("dropPrompt"),
  fileInfo: $("fileInfo"), fileName: $("fileName"), fileMeta: $("fileMeta"),
  changeFileBtn: $("changeFileBtn"), targetSize: $("targetSize"),
  compressBtn: $("compressBtn"), progressSection: $("progressSection"),
  statusText: $("statusText"), cancelBtn: $("cancelBtn"), progressFill: $("progressFill"),
  resultSection: $("resultSection"), origSize: $("origSize"),
  compSize: $("compSize"), savings: $("savings"), downloadBtn: $("downloadBtn"),
};

let ffmpeg = null;
let file = null;
let duration = 0;
let vHeight = 0;
let cancelled = false;
let busy = false;

const fmtSize = (b) =>
  b < 1024 * 1024 ? (b / 1024).toFixed(0) + " KB" : (b / (1024 * 1024)).toFixed(2) + " MB";
const fmtTime = (s) => {
  if (!isFinite(s) || s <= 0) return "–";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/* --- Dosya seçimi --- */

function setFile(f) {
  if (!f || !f.type.startsWith("video/")) {
    if (f) alert("Lütfen bir video dosyası seçin.");
    return;
  }
  file = f;
  els.dropPrompt.hidden = true;
  els.fileInfo.hidden = false;
  els.fileName.textContent = f.name;
  els.fileMeta.textContent = fmtSize(f.size);
  els.compressBtn.disabled = true;
  duration = 0;

  const url = URL.createObjectURL(f);
  const v = document.createElement("video");
  v.preload = "metadata";
  v.onloadedmetadata = () => {
    duration = v.duration;
    vHeight = v.videoHeight;
    URL.revokeObjectURL(url);
    els.fileMeta.textContent = `${fmtSize(f.size)} · ${fmtTime(duration)}`;
    els.compressBtn.disabled = false;
  };
  v.onerror = () => {
    URL.revokeObjectURL(url);
    els.fileMeta.textContent = `${fmtSize(f.size)} · süre okunamadı`;
    els.compressBtn.disabled = false;
  };
  v.src = url;
}

els.dropZone.addEventListener("click", () => els.fileInput.click());
els.changeFileBtn.addEventListener("click", (e) => { e.stopPropagation(); els.fileInput.click(); });
els.fileInput.addEventListener("change", () => setFile(els.fileInput.files[0]));
["dragover", "dragleave", "drop"].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.toggle("dragover", ev === "dragover");
    if (ev === "drop") setFile(e.dataTransfer.files[0]);
  })
);
document.querySelectorAll(".preset").forEach((b) =>
  b.addEventListener("click", () => (els.targetSize.value = b.dataset.size))
);

/* --- FFmpeg --- */

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  setProgress(0);
  setStatus("Sıkıştırma motoru hazırlanıyor… (yalnızca ilk seferde, birkaç saniye sürer)");
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) {
      setProgress(progress * 100);
      updateEta(progress * 100);
    }
  });
  ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));
  
  const abs = (p) => new URL(p, location.href).href;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    classWorkerURL: abs(WORKER_URL),
  });
  return ffmpeg;
}

function setStatus(t) { els.statusText.textContent = t; }
function setProgress(p) { els.progressFill.style.width = p.toFixed(1) + "%"; }


let startTime = 0;
function startTimer() {
  startTime = performance.now();
  updateEta(0);
}
function updateEta(progress) {
  
  if (progress === 0) startTime = performance.now();
  const el = (performance.now() - startTime) / 1000;
  if (progress > 3 && el > 2) {
    const remaining = (el / progress) * (100 - progress);
    setStatus(`Sıkıştırılıyor… ~${fmtTime(remaining)} kaldı`);
  } else if (progress > 0) {
    setStatus("Sıkıştırılıyor…");
  }
}

/* --- Sıkıştırma mantığı --- */


function pickScale(videoKbps, srcHeight) {
  let h;
  if (videoKbps >= 4000) h = 1080;
  else if (videoKbps >= 2000) h = 720;
  else if (videoKbps >= 800) h = 480;
  else h = 360;
  h = Math.min(h, srcHeight || h);
  return `-2:${h}`;
}

async function runPass(ffmpeg, videoKbps, audioKbps, scale, outName) {
  const args = [
    "-i", "input",
    "-c:v", "libx264", "-preset", "veryfast",
    "-b:v", `${videoKbps}k`, "-maxrate", `${videoKbps}k`, "-bufsize", `${videoKbps * 2}k`,
    "-pix_fmt", "yuv420p",
  ];
  if (scale) args.push("-vf", `scale=${scale}:flags=bicubic`);
  args.push(
    "-c:a", "aac", "-b:a", `${audioKbps}k`,
    "-movflags", "+faststart", outName
  );
  await ffmpeg.writeFile("input", new Uint8Array(await file.arrayBuffer()));
  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outName);
  return data.buffer;
}

els.compressBtn.addEventListener("click", async () => {
  if (busy || !file) return;
  busy = true;
  cancelled = false;
  els.compressBtn.disabled = true;
  els.resultSection.hidden = true;
  els.progressSection.hidden = false;
  setProgress(0);

  try {
    const ff = await getFFmpeg();
    const targetBytes = Math.max(1, parseFloat(els.targetSize.value)) * 1024 * 1024;
    const safeBytes = targetBytes * 0.96; 
    
    const dur = duration > 0 ? duration : 1800;
    const totalKbps = (safeBytes * 8) / dur / 1000;
    const audioKbps = Math.max(64, Math.min(128, Math.round(totalKbps * 0.18)));
    let videoKbps = Math.max(80, Math.round(totalKbps - audioKbps));
    let scale = pickScale(videoKbps, vHeight);
    startTimer();
    let out = await runPass(ff, videoKbps, audioKbps, scale, "out.mp4");

    
    if (out.byteLength > targetBytes * 1.02) {
      setStatus("Hedef aşıldı, yeniden sıkıştırılıyor…");
      const steps = { 1080: 720, 720: 480, 480: 360, 360: 360 };
      const curH = parseInt(scale.split(":")[1], 10) || 1080;
      scale = `-2:${steps[curH] || 360}`;
      videoKbps = Math.max(80, Math.round((targetBytes * 0.96 * 8) / dur / 1000) - audioKbps);
      videoKbps = Math.round(videoKbps * 0.9);
      setProgress(0);
      updateEta(0);
      out = await runPass(ff, videoKbps, audioKbps, scale, "out.mp4");
    }

    if (cancelled) return;
    setProgress(100);
    const blob = new Blob([out], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    els.downloadBtn.href = url;
    els.downloadBtn.download = file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4";
    els.origSize.textContent = fmtSize(file.size);
    els.compSize.textContent = fmtSize(blob.size);
    els.savings.textContent =
      Math.round((1 - blob.size / file.size) * 100) + "%";
    els.resultSection.hidden = false;
    els.progressSection.hidden = true;
  } catch (err) {
    if (cancelled) return;
    console.error(err);
    setStatus("Hata: " + (err?.message || String(err) || "bilinmeyen"));
    els.progressSection.hidden = true;
  } finally {
    busy = false;
    if (!cancelled) els.compressBtn.disabled = false;
  }
});

/* --- İptal --- */

els.cancelBtn.addEventListener("click", () => {
  cancelled = true;
  
  if (ffmpeg) { try { ffmpeg.terminate(); } catch (_) {} ffmpeg = null; }
  els.progressSection.hidden = true;
  els.compressBtn.disabled = false;
  setStatus("İptal edildi.");
});
