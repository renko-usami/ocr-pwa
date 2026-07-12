// ===== OCR PWA - OpenRouter 비전 모델 =====
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    apiKey: $("apiKey"),
    model: $("model"),
    autoCopy: $("autoCopy"),
    dropzone: $("dropzone"),
    fileInput: $("fileInput"),
    previewWrap: $("previewWrap"),
    preview: $("preview"),
    clearBtn: $("clearBtn"),
    ocrBtn: $("ocrBtn"),
    copyBtn: $("copyBtn"),
    result: $("result"),
    status: $("status"),
    installBtn: $("installBtn"),
    installHint: $("installHint"),
  };

  const STORE = {
    apiKey: "ocr_api_key",
    model: "ocr_model",
    autoCopy: "ocr_auto_copy",
  };
  const SHARED_DB = "ocr-pwa";
  const SHARED_STORE = "shared-files";
  const SHARED_KEY = "latest";

  let currentFile = null; // { name, type, dataUrl }
  let deferredPrompt = null;

  // ---------- 설정 로드/저장 ----------
  function loadSettings() {
    try {
      els.apiKey.value = localStorage.getItem(STORE.apiKey) || "";
      els.model.value = localStorage.getItem(STORE.model) || "google/gemma-3-27b-it";
      els.autoCopy.checked = localStorage.getItem(STORE.autoCopy) !== "0";
    } catch (e) {
      /* ignore */
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE.apiKey, els.apiKey.value.trim());
      localStorage.setItem(STORE.model, els.model.value.trim());
      localStorage.setItem(STORE.autoCopy, els.autoCopy.checked ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- IndexedDB (공유된 파일 전달) ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SHARED_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SHARED_STORE)) {
          db.createObjectStore(SHARED_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putSharedFile(blob, name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SHARED_STORE, "readwrite");
      tx.objectStore(SHARED_STORE).put({ blob, name, ts: Date.now() }, SHARED_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function takeSharedFile() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SHARED_STORE, "readwrite");
      const store = tx.objectStore(SHARED_STORE);
      const getReq = store.get(SHARED_KEY);
      getReq.onsuccess = () => {
        const val = getReq.result;
        if (val) store.delete(SHARED_KEY);
        resolve(val || null);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // ---------- 상태/버튼 ----------
  function setStatus(msg, type = "") {
    els.status.textContent = msg || "";
    els.status.className = "status" + (type ? ` is-${type}` : "");
  }

  function updateButtons() {
    els.ocrBtn.disabled = !currentFile;
    els.copyBtn.disabled = !els.result.dataset.hasResult;
  }

  // ---------- 이미지 설정 ----------
  function setFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("이미지 파일만 지원됩니다.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      currentFile = { name: file.name, type: file.type, dataUrl: reader.result };
      els.preview.src = reader.result;
      els.previewWrap.hidden = false;
      els.dropzone.style.display = "none";
      updateButtons();
      setStatus(`이미지 로드됨: ${file.name}`);
    };
    reader.onerror = () => setStatus("이미지를 읽지 못했습니다.", "error");
    reader.readAsDataURL(file);
  }

  function clearFile() {
    currentFile = null;
    els.preview.src = "";
    els.previewWrap.hidden = true;
    els.dropzone.style.display = "";
    els.fileInput.value = "";
    updateButtons();
  }

  // ---------- OpenRouter OCR ----------
  async function runOCR() {
    if (!currentFile) return;
    const apiKey = els.apiKey.value.trim();
    const model = els.model.value.trim();
    if (!apiKey) {
      setStatus("OpenRouter API Key를 입력하세요.", "error");
      els.apiKey.focus();
      return;
    }
    if (!model) {
      setStatus("비전 모델을 입력하세요.", "error");
      els.model.focus();
      return;
    }

    saveSettings();
    els.ocrBtn.disabled = true;
    els.copyBtn.disabled = true;
    setStatus("OpenRouter에 OCR 요청 중...");

    const base64 = currentFile.dataUrl.split(",")[1];
    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "이 이미지에 있는 모든 텍스트를 정확하게 추출해 줘. " +
                "텍스트만 출력하고, 불필요한 설명이나 마크다운 코드 블록은 포함하지 마. " +
                "문단/줄바꿈은 원본 이미지의 시각적 구조를 최대한 유지해.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${currentFile.type};base64,${base64}` },
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin + location.pathname,
          "X-Title": "OCR PWA",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const text =
        data?.choices?.[0]?.message?.content?.trim() ||
        data?.choices?.[0]?.message?.content?.[0]?.text?.trim() ||
        "";

      if (!text) {
        throw new Error("응답에서 텍스트를 찾지 못했습니다. 모델이 비전을 지원하는지 확인하세요.");
      }

      els.result.textContent = text;
      els.result.dataset.hasResult = "1";
      updateButtons();
      setStatus("OCR 완료", "success");

      if (els.autoCopy.checked) {
        await copyToClipboard(text);
        setStatus("OCR 완료 · 클립보드에 복사됨", "success");
      }
    } catch (err) {
      console.error(err);
      setStatus(`오류: ${err.message}`, "error");
    } finally {
      els.ocrBtn.disabled = false;
      updateButtons();
    }
  }

  // ---------- 클립보드 ----------
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) throw new Error("복사 실패");
      return true;
    } catch (e) {
      setStatus("클립보드 복사 실패: " + e.message, "error");
      return false;
    }
  }

  async function copyResult() {
    const text = els.result.textContent;
    if (!text || !els.result.dataset.hasResult) return;
    const ok = await copyToClipboard(text);
    if (ok) setStatus("클립보드에 복사됨", "success");
  }

  // ---------- 이벤트 ----------
  function bindEvents() {
    els.dropzone.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) setFile(f);
    });

    ["dragenter", "dragover"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.add("is-drag");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove("is-drag");
      })
    );
    els.dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) setFile(f);
    });

    els.clearBtn.addEventListener("click", clearFile);
    els.ocrBtn.addEventListener("click", runOCR);
    els.copyBtn.addEventListener("click", copyResult);

    [els.apiKey, els.model, els.autoCopy].forEach((el) =>
      el.addEventListener("change", saveSettings)
    );

    // PWA 설치 프롬프트
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      els.installBtn.hidden = false;
      els.installHint.textContent = "앱으로 설치하면 공유 메뉴에서 바로 사용할 수 있어요.";
    });
    els.installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      els.installBtn.hidden = true;
    });
  }

  // ---------- 공유된 파일 확인 ----------
  async function checkSharedFile() {
    try {
      const shared = await takeSharedFile();
      if (shared && shared.blob) {
        const file = new File([shared.blob], shared.name || "shared.png", {
          type: shared.blob.type || "image/png",
        });
        setFile(file);
        setStatus("공유된 이미지를 로드했습니다. OCR 실행을 누르세요.", "success");
      }
    } catch (e) {
      console.warn("공유 파일 확인 실패:", e);
    }
  }

  // ---------- 서비스워커 등록 ----------
  async function registerSW() {
    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("/service-worker.js");
      } catch (e) {
        console.warn("SW 등록 실패:", e);
      }
    }
  }

  // ---------- 초기화 ----------
  async function init() {
    loadSettings();
    bindEvents();
    updateButtons();
    await registerSW();
    await checkSharedFile();
  }

  document.addEventListener("DOMContentLoaded", init);

  // 서비스워커에서 공유 수신 후 페이지에 알림
  navigator.serviceWorker?.addEventListener("message", (e) => {
    if (e.data?.type === "shared-file") {
      checkSharedFile();
    }
  });

  // 페이지가 포커스를 받으면 공유 파일 다시 확인
  window.addEventListener("focus", checkSharedFile);
})();