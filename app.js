// ═══════════════════════════════════════════════════════════
//  LENS — app.js  |  Firebase 10 Modular SDK
// ═══════════════════════════════════════════════════════════

import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
                                   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, deleteDoc, updateDoc,
         getDocs, query, orderBy, limit, startAfter, onSnapshot,
         serverTimestamp, increment, where, writeBatch }
                                   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ───────────────────────────────────────────────────────────
//  CONFIG
// ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAtGUSS7fySXtb8kGN-l1cF93_AYNwAV8Y",
  authDomain:        "lens-feed-dc4ed.firebaseapp.com",
  projectId:         "lens-feed-dc4ed",
  storageBucket:     "lens-feed-dc4ed.firebasestorage.app",
  messagingSenderId: "641813910403",
  appId:             "1:641813910403:web:0a707229e41b856de0dcb6"
};
const ADMIN_EMAIL     = "canesugar251@gmail.com";
const CLOUDINARY_NAME = "PASTE_YOUR_CLOUDINARY_CLOUD_NAME"; // e.g. "dxyz123abc"
const CLOUDINARY_PRESET = "lens_unsigned";                  // your unsigned upload preset
const PAGE_SIZE       = 20;
const INSTA_REGEX     = /instagram\.com\/p\/([A-Za-z0-9_-]+)/;
const IMG_REGEX       = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

// ───────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────
const fbApp  = initializeApp(firebaseConfig);
const auth   = getAuth(fbApp);
const db     = getFirestore(fbApp);

// ───────────────────────────────────────────────────────────
//  STATE
// ───────────────────────────────────────────────────────────
let isAdmin          = false;
let currentUser      = null;
let posts            = [];          // ordered list from Firestore
let activeIndex      = 0;           // which card is center
let feedUnsub        = null;
let commentUnsub     = null;        // for current open image comments
let tickerComments   = [];          // comments of active post
let tickerIndex      = 0;
let tickerTimer      = null;
let selectedFile     = null;        // for file upload tab
let pendingDeleteId  = null;
let activeTab        = "file";

// ───────────────────────────────────────────────────────────
//  DOM
// ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Header
const adminLoginBtn  = $("admin-login-btn");
const adminLogoutBtn = $("admin-logout-btn");
const adminBadge     = $("admin-badge");
const adminPanel     = $("admin-panel");

// Upload panel
const dropzone       = $("dropzone");
const fileInput      = $("file-input");
const browseBtn      = $("browse-btn");
const dropzoneInner  = dropzone.querySelector(".dropzone-inner");
const dropzonePreview= $("dropzone-preview");
const previewImg     = $("preview-img");
const removePreview  = $("remove-preview");
const urlInput       = $("url-input");
const instaUrlInput  = $("insta-url-input");
const instaThumbInput= $("insta-thumb-input");
const captionInput   = $("caption-input");
const captionCount   = $("caption-count");
const publishBtn     = $("publish-btn");

// Carousel
const skeletonStage  = $("skeleton-stage");
const carouselStage  = $("carousel-stage");
const carouselTrack  = $("carousel-track");
const carouselDots   = $("carousel-dots");
const arrowLeft      = $("arrow-left");
const arrowRight     = $("arrow-right");
const emptyState     = $("empty-state");

// Player bar
const playerThumb    = $("player-thumb");
const playerTitle    = $("player-title");
const playerSub      = $("player-sub");
const playerLikeBtn  = $("player-like-btn");
const playerLikeCount= $("player-like-count");
const playerCommentBtn=$("player-comment-btn");
const playerCommentCount=$("player-comment-count");
const commentTicker  = $("comment-ticker");

// Comment drawer
const commentDrawer  = $("comment-drawer");
const drawerBackdrop = $("drawer-backdrop");
const drawerClose    = $("drawer-close");
const drawerCommentsList=$("drawer-comments-list");
const drawerName     = $("drawer-name");
const drawerText     = $("drawer-text");
const drawerNameError= $("drawer-name-error");
const drawerTextError= $("drawer-text-error");
const drawerSubmit   = $("drawer-submit");

// Modals
const authModal      = $("auth-modal");
const authEmail      = $("auth-email");
const authPassword   = $("auth-password");
const authError      = $("auth-error");
const authSubmit     = $("auth-submit");
const authClose      = $("auth-close");

const confirmModal   = $("confirm-modal");
const confirmThumb   = $("confirm-thumb");
const confirmCancel  = $("confirm-cancel");
const confirmDelete  = $("confirm-delete");

const imageModal     = $("image-modal");
const imageModalClose= $("image-modal-close");
const fullscreenImg  = $("fullscreen-img");
const fullscreenCaption = $("fullscreen-caption");

const cardTpl        = $("card-tpl");

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function sanitize(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function setLoading(btn, on) {
  const t = btn.querySelector(".btn-text");
  const l = btn.querySelector(".btn-loader");
  btn.disabled = on;
  if (t) t.classList.toggle("hidden", on);
  if (l) l.classList.toggle("hidden", !on);
}

function showToast(msg, type = "info") {
  const c = $("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span><span>${sanitize(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove(), { once: true });
  }, 3200);
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

function setupAuthListener() {
  onAuthStateChanged(auth, user => {
    currentUser = user;
    isAdmin = !!(user && user.email === ADMIN_EMAIL);
    updateAdminUI();
  });
}

function updateAdminUI() {
  adminLoginBtn.classList.toggle("hidden", isAdmin);
  adminLogoutBtn.classList.toggle("hidden", !isAdmin);
  adminBadge.classList.toggle("hidden", !isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
}

adminLoginBtn.addEventListener("click", () => {
  authEmail.value = ""; authPassword.value = ""; authError.textContent = "";
  authModal.classList.remove("hidden");
  setTimeout(() => authEmail.focus(), 100);
});
authClose.addEventListener("click", () => authModal.classList.add("hidden"));
authModal.addEventListener("click", e => { if (e.target === authModal) authModal.classList.add("hidden"); });
authPassword.addEventListener("keydown", e => { if (e.key === "Enter") authSubmit.click(); });

authSubmit.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const pass  = authPassword.value;
  authError.textContent = "";
  if (!email || !pass) { authError.textContent = "Email and password required."; return; }
  setLoading(authSubmit, true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    authModal.classList.add("hidden");
    showToast("Welcome back, Admin.", "success");
  } catch (err) {
    authError.textContent = friendlyAuthError(err.code);
  } finally {
    setLoading(authSubmit, false);
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  if (feedUnsub) { feedUnsub(); feedUnsub = null; }
  if (commentUnsub) { commentUnsub(); commentUnsub = null; }
  await signOut(auth);
  showToast("Logged out.", "info");
  setupFeedListener();
});

function friendlyAuthError(code) {
  const m = {
    "auth/user-not-found":"No account found.",
    "auth/wrong-password":"Incorrect password.",
    "auth/invalid-email":"Invalid email.",
    "auth/too-many-requests":"Too many attempts. Try later.",
    "auth/invalid-credential":"Invalid email or password.",
  };
  return m[code] || "Sign-in failed.";
}

// ═══════════════════════════════════════════════════════════
//  UPLOAD TABS
// ═══════════════════════════════════════════════════════════

document.querySelectorAll(".upload-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".upload-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    $(`tab-${activeTab}`).classList.add("active");
  });
});

// ═══════════════════════════════════════════════════════════
//  FILE UPLOAD (Cloudinary)
// ═══════════════════════════════════════════════════════════

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", e => {
  e.preventDefault(); dropzone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) handleFile(file);
});
dropzone.addEventListener("click", e => {
  if (e.target === browseBtn || dropzonePreview.contains(e.target)) return;
  if (selectedFile) return;
  fileInput.click();
});

removePreview.addEventListener("click", e => {
  e.stopPropagation();
  selectedFile = null;
  fileInput.value = "";
  dropzonePreview.classList.add("hidden");
  dropzoneInner.style.display = "";
  $("file-error").textContent = "";
});

function handleFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    dropzonePreview.classList.remove("hidden");
    dropzoneInner.style.display = "none";
  };
  reader.readAsDataURL(file);
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Cloudinary upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ═══════════════════════════════════════════════════════════
//  PUBLISH POST
// ═══════════════════════════════════════════════════════════

captionInput.addEventListener("input", () => {
  captionCount.textContent = captionInput.value.length;
});

publishBtn.addEventListener("click", async () => {
  const caption = captionInput.value.trim().slice(0, 150);
  let thumbUrl  = "";
  let postUrl   = "";
  let postType  = "image";

  // Clear errors
  [$("file-error"), $("url-error"), $("insta-url-error"), $("insta-thumb-error")]
    .forEach(el => { if (el) el.textContent = ""; });

  setLoading(publishBtn, true);

  try {
    if (activeTab === "file") {
      if (!selectedFile) { $("file-error").textContent = "Please select a photo."; return; }
      // Upload to Cloudinary
      thumbUrl = await uploadToCloudinary(selectedFile);
      postUrl  = thumbUrl;
      postType = "image";

    } else if (activeTab === "url") {
      const u = urlInput.value.trim();
      if (!u) { $("url-error").textContent = "Please enter a URL."; return; }
      if (!IMG_REGEX.test(u)) { $("url-error").textContent = "URL must end in .jpg .jpeg .png .gif .webp"; return; }
      thumbUrl = u; postUrl = u; postType = "image";

    } else if (activeTab === "instagram") {
      const iu = instaUrlInput.value.trim();
      const it = instaThumbInput.value.trim();
      const match = iu.match(INSTA_REGEX);
      if (!match) { $("insta-url-error").textContent = "Enter a valid Instagram post URL."; return; }
      if (!it)    { $("insta-thumb-error").textContent = "Thumbnail is required."; return; }
      if (!IMG_REGEX.test(it)) { $("insta-thumb-error").textContent = "Thumbnail must end in .jpg .png etc."; return; }
      postUrl  = `https://www.instagram.com/p/${match[1]}/`;
      thumbUrl = it;
      postType = "instagram";
    }

    await addDoc(collection(db, "images"), {
      url: postUrl, thumbUrl, type: postType, caption,
      likes: 0, createdAt: serverTimestamp()
    });

    // Reset form
    captionInput.value = ""; captionCount.textContent = "0";
    urlInput.value = ""; instaUrlInput.value = ""; instaThumbInput.value = "";
    selectedFile = null; fileInput.value = "";
    dropzonePreview.classList.add("hidden"); dropzoneInner.style.display = "";
    showToast("Post published!", "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to publish: " + err.message, "error");
  } finally {
    setLoading(publishBtn, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  FEED LISTENER
// ═══════════════════════════════════════════════════════════

function setupFeedListener() {
  if (feedUnsub) feedUnsub();
  skeletonStage.classList.remove("hidden");
  carouselStage.classList.add("hidden");
  emptyState.classList.add("hidden");

  const q = query(collection(db, "images"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
  feedUnsub = onSnapshot(q, snap => {
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    skeletonStage.classList.add("hidden");

    if (posts.length === 0) {
      carouselStage.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }
    carouselStage.classList.remove("hidden");
    emptyState.classList.add("hidden");

    // Clamp activeIndex
    if (activeIndex >= posts.length) activeIndex = posts.length - 1;

    renderCarousel();
    updatePlayerBar(activeIndex);
  }, err => {
    console.error("Feed error:", err);
    showToast("Failed to load feed.", "error");
    skeletonStage.classList.add("hidden");
  });
}

// ═══════════════════════════════════════════════════════════
//  CAROUSEL RENDER
// ═══════════════════════════════════════════════════════════

function renderCarousel() {
  carouselTrack.innerHTML = "";
  carouselDots.innerHTML  = "";

  // Show center ± 2 cards for performance
  const start = Math.max(0, activeIndex - 2);
  const end   = Math.min(posts.length - 1, activeIndex + 2);

  for (let i = start; i <= end; i++) {
    const post = posts[i];
    const card = buildCard(post, i);
    carouselTrack.appendChild(card);
  }

  // Dots
  posts.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "carousel-dot" + (i === activeIndex ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    carouselDots.appendChild(dot);
  });

  // Arrow states
  arrowLeft.disabled  = activeIndex === 0;
  arrowRight.disabled = activeIndex === posts.length - 1;
}

function buildCard(post, index) {
  const clone = cardTpl.content.cloneNode(true);
  const card  = clone.querySelector(".carousel-card");
  card.dataset.id = post.id;
  if (index === activeIndex) card.classList.add("active");
  card.style.animationDelay = `${Math.abs(index - activeIndex) * 60}ms`;

  const img    = card.querySelector(".card-img");
  const badge  = card.querySelector(".card-insta-badge");
  const capEl  = card.querySelector(".card-caption");
  const timeEl = card.querySelector(".card-time");
  const delBtn = card.querySelector(".card-delete-btn");

  img.src = post.thumbUrl || post.url;
  img.alt = post.caption || "Post";
  capEl.textContent  = post.caption || "";
  timeEl.textContent = timeAgo(post.createdAt);

  if (post.type === "instagram") badge.classList.remove("hidden");
  if (isAdmin) delBtn.classList.remove("hidden");

  // Click card → go to it, or open fullscreen if already active
  card.addEventListener("click", e => {
    if (delBtn.contains(e.target)) return;
    if (index === activeIndex) {
      if (post.type === "instagram") {
        window.open(post.url, "_blank", "noopener");
      } else {
        openFullscreen(post);
      }
    } else {
      goTo(index);
    }
  });

  delBtn.addEventListener("click", e => {
    e.stopPropagation();
    openConfirmDelete(post);
  });

  return card;
}

function renderCard(post) {
  return buildCard(post, posts.findIndex(p => p.id === post.id));
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════

function goTo(index) {
  if (index < 0 || index >= posts.length) return;
  activeIndex = index;
  renderCarousel();
  updatePlayerBar(index);
}

arrowLeft.addEventListener("click",  () => goTo(activeIndex - 1));
arrowRight.addEventListener("click", () => goTo(activeIndex + 1));

// Touch/swipe support
let touchStartX = 0;
carouselTrack.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
carouselTrack.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) goTo(activeIndex + (dx < 0 ? 1 : -1));
});

// Keyboard
document.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft")  goTo(activeIndex - 1);
  if (e.key === "ArrowRight") goTo(activeIndex + 1);
  if (e.key === "Escape") {
    authModal.classList.add("hidden");
    confirmModal.classList.add("hidden");
    imageModal.classList.add("hidden");
    closeCommentDrawer();
  }
});

// ═══════════════════════════════════════════════════════════
//  PLAYER BAR
// ═══════════════════════════════════════════════════════════

function updatePlayerBar(index) {
  const post = posts[index];
  if (!post) return;

  playerThumb.src    = post.thumbUrl || post.url;
  playerThumb.style.display = "block";
  playerTitle.textContent   = post.caption || "Untitled";
  playerSub.textContent     = timeAgo(post.createdAt);

  // Like state
  const liked = !!localStorage.getItem(`liked_${post.id}`);
  playerLikeBtn.classList.toggle("liked", liked);
  playerLikeCount.textContent = post.likes || 0;

  // Subscribe comments for ticker + drawer
  if (commentUnsub) { commentUnsub(); commentUnsub = null; }
  clearTicker();

  const q = query(
    collection(db, "comments"),
    where("imageId", "==", post.id),
    orderBy("createdAt", "asc")
  );

  commentUnsub = onSnapshot(q, snap => {
    tickerComments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    playerCommentCount.textContent = tickerComments.length;
    startTicker();
    // If drawer open, re-render
    if (!commentDrawer.classList.contains("hidden")) {
      renderDrawerComments(post.id);
    }
  }, err => console.error("Comments:", err));
}

// ═══════════════════════════════════════════════════════════
//  COMMENT TICKER
// ═══════════════════════════════════════════════════════════

function clearTicker() {
  clearInterval(tickerTimer);
  tickerComments = []; tickerIndex = 0;
  commentTicker.innerHTML = `<span class="ticker-item">Swipe through posts ↑</span>`;
}

function startTicker() {
  clearInterval(tickerTimer);
  if (tickerComments.length === 0) {
    commentTicker.innerHTML = `<span class="ticker-item">No comments yet — be first! 💬</span>`;
    return;
  }
  tickerIndex = 0;
  showTickerComment();
  tickerTimer = setInterval(() => {
    tickerIndex = (tickerIndex + 1) % tickerComments.length;
    showTickerComment();
  }, 5000);
}

function showTickerComment() {
  const c = tickerComments[tickerIndex];
  if (!c) return;
  commentTicker.classList.remove("scrolling");
  void commentTicker.offsetWidth; // reflow
  commentTicker.classList.add("scrolling");
  commentTicker.innerHTML = `<span class="ticker-item"><strong style="color:var(--accent-bright)">${sanitize(c.name)}</strong>: ${sanitize(c.text)}</span>`;
}

// ═══════════════════════════════════════════════════════════
//  LIKE
// ═══════════════════════════════════════════════════════════

function handleLike(imageId) {
  const key = `liked_${imageId}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");

  playerLikeBtn.classList.add("liked", "pop");
  playerLikeBtn.addEventListener("animationend", () => playerLikeBtn.classList.remove("pop"), { once: true });

  const n = parseInt(playerLikeCount.textContent || "0", 10);
  playerLikeCount.textContent = n + 1;

  updateDoc(doc(db, "images", imageId), { likes: increment(1) })
    .catch(err => {
      playerLikeBtn.classList.remove("liked");
      localStorage.removeItem(key);
      playerLikeCount.textContent = n;
      showToast("Failed to like.", "error");
      console.error(err);
    });
}

playerLikeBtn.addEventListener("click", () => {
  const post = posts[activeIndex];
  if (post) handleLike(post.id);
});

// ═══════════════════════════════════════════════════════════
//  COMMENT DRAWER
// ═══════════════════════════════════════════════════════════

playerCommentBtn.addEventListener("click", () => {
  const post = posts[activeIndex];
  if (!post) return;
  openCommentDrawer(post.id);
});

function openCommentDrawer(imageId) {
  commentDrawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  renderDrawerComments(imageId);
  drawerName.focus();
}

function closeCommentDrawer() {
  commentDrawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
}

drawerClose.addEventListener("click", closeCommentDrawer);
drawerBackdrop.addEventListener("click", closeCommentDrawer);

function renderDrawerComments(imageId) {
  drawerCommentsList.innerHTML = "";
  if (tickerComments.length === 0) {
    drawerCommentsList.innerHTML = `<p class="no-comments">No comments yet.</p>`;
    return;
  }
  tickerComments.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item";
    item.innerHTML = `
      <span class="comment-name">${sanitize(c.name)}</span>
      <span class="comment-text">${sanitize(c.text)}</span>
      <span class="comment-time">${timeAgo(c.createdAt)}</span>
      ${isAdmin ? `<button class="comment-del-btn admin-only" data-cid="${c.id}">Delete</button>` : ""}
    `;
    if (isAdmin) {
      item.querySelector(".comment-del-btn").addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, "comments", c.id));
          showToast("Comment deleted.", "info");
        } catch (err) {
          showToast("Failed to delete comment.", "error");
          console.error(err);
        }
      });
    }
    drawerCommentsList.appendChild(item);
  });
  drawerCommentsList.scrollTop = drawerCommentsList.scrollHeight;
}

function validateComment(name, text) {
  if (!name || name.length < 2)  return { field: "name", msg: "Name must be at least 2 characters." };
  if (name.length > 30)          return { field: "name", msg: "Name too long (max 30)." };
  if (!text || text.length < 5)  return { field: "text", msg: "Comment must be at least 5 characters." };
  if (text.length > 200)         return { field: "text", msg: "Comment too long (max 200)." };
  return null;
}

async function postComment(imageId, name, text) {
  await addDoc(collection(db, "comments"), {
    imageId,
    name: name.slice(0, 30),
    text: text.slice(0, 200),
    createdAt: serverTimestamp()
  });
}

drawerSubmit.addEventListener("click", async () => {
  const name = drawerName.value.trim();
  const text = drawerText.value.trim();
  drawerNameError.textContent = "";
  drawerTextError.textContent = "";

  const err = validateComment(name, text);
  if (err) {
    if (err.field === "name") drawerNameError.textContent = err.msg;
    else                      drawerTextError.textContent = err.msg;
    return;
  }

  const post = posts[activeIndex];
  if (!post) return;

  setLoading(drawerSubmit, true);
  try {
    await postComment(post.id, name, text);
    drawerName.value = "";
    drawerText.value = "";
    showToast("Comment posted!", "success");
  } catch (e) {
    drawerTextError.textContent = "Failed to post. Try again.";
    console.error(e);
  } finally {
    setLoading(drawerSubmit, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  DELETE IMAGE
// ═══════════════════════════════════════════════════════════

function deleteImage(imageId) { return deleteImage_impl(imageId); }

async function deleteImage_impl(imageId) {
  const batch = writeBatch(db);
  // Delete all comments first
  const commentsSnap = await getDocs(
    query(collection(db, "comments"), where("imageId", "==", imageId))
  );
  commentsSnap.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "images", imageId));
  await batch.commit();
}

function openConfirmDelete(post) {
  pendingDeleteId = post.id;
  confirmThumb.src = post.thumbUrl || post.url;
  confirmModal.classList.remove("hidden");
}

confirmCancel.addEventListener("click", () => {
  confirmCancel.classList.add("wiggle");
  confirmCancel.addEventListener("animationend", () => confirmCancel.classList.remove("wiggle"), { once: true });
});

confirmDelete.addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  confirmModal.classList.add("hidden");

  // Animate card out
  const cardEl = carouselTrack.querySelector(`[data-id="${id}"]`);
  if (cardEl) {
    cardEl.style.transition = "transform 0.3s ease, opacity 0.3s ease";
    cardEl.style.transform  = "scale(0.85)";
    cardEl.style.opacity    = "0";
  }

  try {
    await deleteImage(id);
    showToast("Post deleted.", "info");
    pendingDeleteId = null;
    if (commentUnsub) { commentUnsub(); commentUnsub = null; }
    if (activeIndex >= posts.length - 1 && activeIndex > 0) activeIndex--;
  } catch (err) {
    showToast("Failed to delete post.", "error");
    console.error(err);
  }
});

confirmModal.addEventListener("click", e => {
  if (e.target === confirmModal) confirmModal.classList.add("hidden");
});

// ═══════════════════════════════════════════════════════════
//  FULLSCREEN IMAGE MODAL
// ═══════════════════════════════════════════════════════════

function openFullscreen(post) {
  fullscreenImg.src = post.thumbUrl || post.url;
  fullscreenCaption.textContent = post.caption || "";
  imageModal.classList.remove("hidden");
}

imageModalClose.addEventListener("click", () => imageModal.classList.add("hidden"));
imageModal.addEventListener("click", e => { if (e.target === imageModal) imageModal.classList.add("hidden"); });

// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════

setupAuthListener();
setupFeedListener();
