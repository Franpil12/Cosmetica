const form = document.getElementById("form-analisis");
const inputFoto = document.getElementById("foto");
const contenedorResultado = document.getElementById("resultado");
const previewImg = document.getElementById("preview-img");
const previewEmpty = document.getElementById("preview-empty");
const fileMeta = document.getElementById("file-meta");

let currentPreviewUrl = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function normalizeLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function formatConfidence(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${(value * 100).toFixed(1)}%`;
}

function resolveApiBaseUrl() {
  const configured = String(window.APP_CONFIG?.API_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return window.location.origin;
}

function resolveAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `${resolveApiBaseUrl()}${raw}`;
  }
  return `${resolveApiBaseUrl()}/${raw.replace(/^\/+/, "")}`;
}

function updateSelectedPreview(file) {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }

  if (!file) {
    previewImg.style.display = "none";
    previewImg.removeAttribute("src");
    previewEmpty.style.display = "block";
    fileMeta.textContent = "Aun no has seleccionado archivo.";
    return;
  }

  currentPreviewUrl = URL.createObjectURL(file);
  previewImg.src = currentPreviewUrl;
  previewImg.style.display = "block";
  previewEmpty.style.display = "none";
  fileMeta.textContent = `${file.name} - ${formatBytes(file.size)}`;
}

function renderError(message) {
  contenedorResultado.innerHTML = `<div class="result-error">${escapeHtml(message)}</div>`;
}

function renderAccessoryCards(accessories) {
  if (!accessories.length) {
    return '<p class="result-empty">No se encontraron accesorios locales para mostrar.</p>';
  }

  return accessories.map((item) => `
    <article class="accessory-card">
      <img src="${escapeHtml(resolveAssetUrl(item.image?.imageUrl || ""))}" alt="${escapeHtml(item.label)}">
      <div class="accessory-card-body">
        <h3>${escapeHtml(item.label)}</h3>
        <p>Recomendado para rostro ${escapeHtml(item.shape || "")}.</p>
        <p class="result-note">${escapeHtml(item.gallerySize || 1)} imagen(es) disponibles en el catalogo.</p>
      </div>
    </article>
  `).join("");
}

function renderTopMatches(localSignal) {
  const matches = Array.isArray(localSignal?.top_matches) ? localSignal.top_matches : [];
  if (!matches.length) {
    return '<p class="result-note">Sin ranking local disponible.</p>';
  }

  return `
    <div class="match-list">
      ${matches.map((item) => `
        <span class="match-chip">
          <strong>${escapeHtml(item.face_shape)}</strong>
          <span>distancia ${escapeHtml(item.distance)}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function renderSignalCard(title, value, meta) {
  return `
    <article class="signal-card">
      <p class="signal-card-label">${escapeHtml(title)}</p>
      <h3>${escapeHtml(value || "N/D")}</h3>
      <p>${meta}</p>
    </article>
  `;
}

function renderSuccess(file, payload) {
  const analysis = payload.analysis || {};
  const signals = payload.predictionSignals || {};
  const localSignal = signals.local || null;
  const finalSignal = signals.final || {};
  const referenceFace = payload.referenceFace;
  const accessories = payload.accessoryRecommendations || [];
  const warning = payload.warning;
  const previewUrl = URL.createObjectURL(file);

  const recommendations = (analysis.recommendations || [])
    .slice(0, 5)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const accessoryFocus = (analysis.accessory_focus || []).length
    ? analysis.accessory_focus.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")
    : '<span class="result-note">Sin foco definido.</span>';

  const referenceHtml = referenceFace
    ? `
      <article class="photo-card">
        <p>ROSTRO DE REFERENCIA</p>
        <img src="${escapeHtml(resolveAssetUrl(referenceFace.imageUrl))}" alt="${escapeHtml(referenceFace.label || "Rostro de referencia")}">
        <div class="result-note">${escapeHtml(referenceFace.label || "")}</div>
      </article>
    `
    : `
      <article class="photo-card">
        <p>ROSTRO DE REFERENCIA</p>
        <div class="result-empty">No hay rostro de referencia disponible en el catalogo.</div>
      </article>
    `;

  const warningHtml = warning ? `<p class="result-note">Aviso: ${escapeHtml(warning)}</p>` : "";

  contenedorResultado.innerHTML = `
    <article class="result-card result-summary">
      <h2>Forma detectada: ${escapeHtml(analysis.face_shape || "No definido")}</h2>
      <p>${escapeHtml(analysis.style_summary || "Sin resumen.")}</p>
      <p>Catalogo aplicado: ${escapeHtml(analysis.catalog_face_shape || analysis.face_shape || "N/A")}</p>
    </article>

    <article class="result-card">
      <div class="result-photo-grid">
        <article class="photo-card">
          <p>TU FOTO</p>
          <img src="${previewUrl}" alt="Tu foto">
        </article>
        ${referenceHtml}
      </div>
    </article>

    <article class="result-card">
      <div class="result-block">
        <strong>Foco de accesorios</strong>
        <div class="tag-list">${accessoryFocus}</div>
        <strong>Recomendaciones</strong>
        <ul class="recommendation-list">${recommendations || "<li>No hay recomendaciones.</li>"}</ul>
        ${warningHtml}
      </div>
    </article>

    <article class="result-card">
      <strong>Accesorios sugeridos del catalogo local</strong>
      <div class="accessory-grid">
        ${renderAccessoryCards(accessories)}
      </div>
    </article>

    <article class="result-card">
      <details class="result-more">
        <summary>Mostrar mas informacion</summary>
        <div class="signal-grid">
          ${renderSignalCard("OPENAI", signals.openai?.face_shape, "Lectura visual y razonamiento del rostro.")}
          ${renderSignalCard("MODELO LOCAL", localSignal?.face_shape, `Baseline: ${escapeHtml(localSignal?.baseline || "N/D")} | confianza ${escapeHtml(formatConfidence(localSignal?.confidence))}`)}
          ${renderSignalCard("DECISION FINAL", finalSignal.face_shape, `Estrategia: ${escapeHtml(normalizeLabel(finalSignal.strategy || analysis.prediction_strategy || "N/D"))}`)}
        </div>
        <div class="result-note">
          <strong>Como se decidio:</strong> ${escapeHtml(analysis.prediction_explanation || "Sin detalle disponible.")}
        </div>
        ${renderTopMatches(localSignal)}
      </details>
    </article>
  `;

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);
}

if (form && inputFoto && contenedorResultado) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = inputFoto.files?.[0];
    if (!file) {
      renderError("Selecciona una imagen primero.");
      return;
    }

    contenedorResultado.innerHTML = '<div class="result-loading">Analizando rostro, consultando el backend y buscando accesorios del catalogo...</div>';

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch(`${resolveApiBaseUrl()}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const details = data.details ? ` Detalle: ${data.details}` : "";
        renderError((data.error || "Error en el analisis.") + details);
        return;
      }

      renderSuccess(file, data);
    } catch (error) {
      renderError("No se pudo conectar con el backend. Revisa la URL configurada de la API y vuelve a intentar.");
      console.error(error);
    }
  });

  inputFoto.addEventListener("change", () => {
    updateSelectedPreview(inputFoto.files?.[0] || null);
  });
}
