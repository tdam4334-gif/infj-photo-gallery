/* 心隅 · 交互层：心情筛选、上传、灯箱、本地保存 */

const MOOD_LABELS = {
  quiet: "安静",
  light: "微光",
  rain: "雨天",
  night: "夜色",
  nature: "自然",
  alone: "独处",
  soft: "温柔",
};

const SEED_PHOTOS = [
  {
    id: "seed-book",
    src: "assets/photo-book.jpg",
    caption: "窗边的书页停在那一句，茶还温着。",
    mood: "quiet",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-forest",
    src: "assets/photo-forest.jpg",
    caption: "雾把路收窄了，反而更想往前走。",
    mood: "nature",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-rain",
    src: "assets/photo-rain.jpg",
    caption: "雨点把城市揉软了，像隔着一层旧毛衣。",
    mood: "rain",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-chair",
    src: "assets/photo-chair.jpg",
    caption: "空椅子并不空——它只是在等一个愿意发呆的人。",
    mood: "alone",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-stars",
    src: "assets/photo-stars.jpg",
    caption: "远处那盏灯比星星更让人心安。",
    mood: "night",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-ocean",
    src: "assets/photo-ocean.jpg",
    caption: "海把话说得很轻，所以要凑近听。",
    mood: "quiet",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-flower",
    src: "assets/photo-flower.jpg",
    caption: "不是所有温柔都需要被大声确认。",
    mood: "soft",
    author: "编辑部",
    seed: true,
  },
  {
    id: "seed-moon",
    src: "assets/photo-moon.jpg",
    caption: "月光从帘子缝里进来，像不请自来的安慰。",
    mood: "light",
    author: "编辑部",
    seed: true,
  },
];

const STORAGE_KEY = "xinyu-infj-photos-v1";

const galleryWall = document.getElementById("gallery-wall");
const galleryEmpty = document.getElementById("gallery-empty");
const dialogRoot = document.getElementById("upload-dialog");
const uploadForm = document.getElementById("upload-form");
const photoInput = document.getElementById("photo-input");
const photoPreview = document.getElementById("photo-preview");
const photoChange = document.getElementById("photo-change");
const dropzone = document.getElementById("dropzone");
const dropzoneEmpty = document.getElementById("dropzone-empty");
const formError = document.getElementById("form-error");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxMeta = document.getElementById("lightbox-meta");
const toast = document.getElementById("toast");

let activeMood = "all";
let pendingPhotoDataUrl = "";
let lastFocus = null;

function loadUserPhotos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUserPhotos(photos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    return true;
  } catch {
    showToast("本地存储空间不足，照片未能保存。可以换一张更小的图。");
    return false;
  }
}

function allPhotos() {
  return [...loadUserPhotos(), ...SEED_PHOTOS];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderGallery() {
  const photos = allPhotos();
  const visible =
    activeMood === "all"
      ? photos
      : photos.filter((photo) => photo.mood === activeMood);

  galleryWall.innerHTML = "";
  galleryEmpty.hidden = visible.length > 0;

  visible.forEach((photo) => {
    const card = document.createElement("figure");
    card.className = "photo-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看照片：${photo.caption || "未命名"}`);
    card.dataset.photoId = photo.id;

    const moodLabel = MOOD_LABELS[photo.mood] || "安静";
    card.innerHTML = `
      <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.caption || "分享的照片")}" loading="lazy" />
      <figcaption>
        <p class="photo-caption">${escapeHtml(photo.caption || "未留下文字，但照片本身已经说了不少。")}</p>
        <div class="photo-meta">
          <span class="mood-tag">${escapeHtml(moodLabel)}</span>
          <span>${escapeHtml(photo.author || "匿名 INFJ")}</span>
        </div>
      </figcaption>
    `;

    const open = () => openLightbox(photo);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    galleryWall.appendChild(card);
  });
}

function openLightbox(photo) {
  lightboxImage.src = photo.src;
  lightboxImage.alt = photo.caption || "照片";
  lightboxCaption.textContent = photo.caption || "未留下文字。";
  lightboxMeta.textContent = `${MOOD_LABELS[photo.mood] || "安静"}　${photo.author || "匿名 INFJ"}`;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  lightbox.querySelector(".lightbox-close").focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = "";
  document.body.style.overflow = "";
}

function openUploadDialog() {
  lastFocus = document.activeElement;
  dialogRoot.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("caption-input").focus();
}

function closeUploadDialog() {
  dialogRoot.hidden = true;
  document.body.style.overflow = "";
  resetForm();
  if (lastFocus && typeof lastFocus.focus === "function") {
    lastFocus.focus();
  }
}

function resetForm() {
  uploadForm.reset();
  pendingPhotoDataUrl = "";
  photoPreview.hidden = true;
  photoPreview.removeAttribute("src");
  photoChange.hidden = true;
  dropzoneEmpty.hidden = false;
  formError.hidden = true;
  formError.textContent = "";
}

function setPreview(dataUrl) {
  pendingPhotoDataUrl = dataUrl;
  photoPreview.src = dataUrl;
  photoPreview.hidden = false;
  photoChange.hidden = false;
  dropzoneEmpty.hidden = true;
  formError.hidden = true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    formError.hidden = false;
    formError.textContent = "请选择 JPG、PNG 或 WebP 图片。";
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    formError.hidden = false;
    formError.textContent = "这张图超过 8MB 了。换一张更轻的，保存会更稳。";
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    setPreview(dataUrl);
  } catch {
    formError.hidden = false;
    formError.textContent = "照片没能读出来，再试一次。";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function submitPhoto(event) {
  event.preventDefault();

  if (!pendingPhotoDataUrl) {
    formError.hidden = false;
    formError.textContent = "先选一张照片吧。";
    dropzone.focus();
    return;
  }

  const caption = document.getElementById("caption-input").value.trim();
  const name = document.getElementById("name-input").value.trim() || "匿名 INFJ";
  const mood =
    uploadForm.querySelector('input[name="mood"]:checked')?.value || "quiet";

  const photo = {
    id: `user-${Date.now()}`,
    src: pendingPhotoDataUrl,
    caption: caption || "未留下文字，但照片本身已经说了不少。",
    mood,
    author: name,
    createdAt: Date.now(),
  };

  const next = [photo, ...loadUserPhotos()];
  if (!saveUserPhotos(next)) {
    return;
  }

  activeMood = "all";
  document.querySelectorAll(".mood-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.mood === "all");
  });
  renderGallery();
  closeUploadDialog();
  showToast("已放进收藏馆。谢谢你留下这一帧。");
  document.getElementById("gallery").scrollIntoView({ behavior: "smooth" });
}

function bindEvents() {
  document.querySelectorAll("[data-open-upload]").forEach((el) => {
    el.addEventListener("click", openUploadDialog);
  });

  document.querySelectorAll("[data-close-upload]").forEach((el) => {
    el.addEventListener("click", closeUploadDialog);
  });

  document.querySelectorAll("[data-close-lightbox]").forEach((el) => {
    el.addEventListener("click", closeLightbox);
  });

  document.querySelectorAll(".mood-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeMood = chip.dataset.mood || "all";
      document.querySelectorAll(".mood-chip").forEach((item) => {
        item.classList.toggle("is-active", item === chip);
      });
      renderGallery();
    });
  });

  dropzone.addEventListener("click", (event) => {
    if (event.target === photoChange) return;
    photoInput.click();
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      photoInput.click();
    }
  });

  photoChange.addEventListener("click", (event) => {
    event.stopPropagation();
    photoInput.click();
  });

  photoInput.addEventListener("change", () => {
    handleFile(photoInput.files?.[0]);
  });

  ["dragenter", "dragover"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    handleFile(file);
  });

  uploadForm.addEventListener("submit", submitPhoto);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!lightbox.hidden) closeLightbox();
      else if (!dialogRoot.hidden) closeUploadDialog();
    }
  });
}

bindEvents();
renderGallery();
