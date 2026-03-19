// ═══════════════════════════════════════════════════════════
//  LENS — app.js
//  Firebase 10 (modular SDK via CDN)
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  increment,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ───────────────────────────────────────────────────────────
//  CONFIGURATION
// ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAtGUSS7fySXtb8kGN-l1cF93_AYNwAV8Y",
  authDomain:        "lens-feed-dc4ed.firebaseapp.com",
  projectId:         "lens-feed-dc4ed",
  storageBucket:     "lens-feed-dc4ed.firebasestorage.app",
  messagingSenderId: "641813910403",
  appId:             "1:641813910403:web:0a707229e41b856de0dcb6"
};

const ADMIN_EMAIL      = "canesugar251@gmail.com";
const PAGE_SIZE        = 15;
const INSTAGRAM_REGEX  = /instagram\.com\/p\/([A-Za-z0-9_-]+)/;
const DIRECT_IMG_REGEX = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

// ───────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ───────────────────────────────────────────────────────────
//  STATE
// ───────────────────────────────────────────────────────────
let currentUser    = null;
let isAdmin        = false;
let lastVisibleDoc = null;
let hasMore        = false;
let feedUnsubscribe= null;
let commentUnsubs  = {};
let openImageId    = null;
let currentUrlType = "instagram";

// ───────────────────────────────────────────────────────────
//  DOM REFS
// ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const skeletonGrid      = $("skeleton-grid");
const imageGrid         = $("image-grid");
const emptyState        = $("empty-state");
const loadMoreContainer = $("load-more-container");
const loadMoreBtn       = $("load-more-btn");

const adminLoginBtn  = $("admin-login-btn");
const adminLogoutBtn = $("admin-logout-btn");
const adminBadge     = $("admin-badge");
const adminPanel     = $("admin-panel");

const imgUrlInput    = $("img-url-input");
const imgThumbInput  = $("img-thumb-input");
const thumbGroup     = $("thumb-group");
const imgCaptionInput= $("img-caption-input");
const captionCount   = $("caption-count");
const postImageBtn   = $("post-image-btn");
const urlError       = $("url-error");
const thumbError     = $("thumb-error");

const authModal      = $("auth-modal");
const authEmail      = $("auth-email");
const authPassword   = $("auth-password");
const authError      = $("auth-error");
const authSubmitBtn  = $("auth-submit-btn");
const authModalClose = $("auth-modal-close");

const imageModal         = $("image-modal");
const imageModalClose    = $("image-modal-close");
const modalImg           = $("modal-img");
const modalCaption       = $("modal-caption");
const modalTime          = $("modal-time");
const modalLikeBtn       = $("modal-like-btn");
const modalLikeCount     = $("modal-like-count");
const modalCommentsList  = $("modal-comments-list");
const modalCommentName   = $("modal-comment-name");
const modalCommentText   = $("modal-comment-text");
const modalNameError     = $("modal-name-error");
const modalTextError     = $("modal-text-error");
const modalCommentSubmit = $("modal-comment-submit");

const confirmModal     = $("confirm-modal");
const confirmTitle     = $("confirm-title");
const confirmMessage   = $("confirm-message");
const confirmCancelBtn = $("confirm-cancel-btn");
const confirmOkBtn     = $("confirm-ok-btn");

const cardTemplate = $("card-template");

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

function timeAgo(ts) {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (seconds < 60)    return "just now";
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setLoading(btn, loading) {
  const text   = btn.querySelector(".btn-text");
  const loader = btn.querySelector(".btn-loader");
  btn.disabled = loading;
  if (text)   text.classList.toggle("hidden", loading);
  if (loader) loader.classList.toggle("hidden", !loading);
}

function showToast(message, type = "info") {
  const container = $("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span><span>${sanitize(message)}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove());
  }, 3200);
}

function showConfirm(title, message) {
  return new Promise(resolve => {
    confirmTitle.textContent   = title;
    confirmMessage.textContent = message;
    confirmModal.classList.remove("hidden");
    const ok     = () => { cleanup(); resolve(true); };
    const cancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      confirmOkBtn.removeEventListener("click", ok);
      confirmCancelBtn.removeEventListener("click", cancel);
      confirmModal.classList.add("hidden");
    };
    confirmOkBtn.addEventListener("click", ok);
    confirmCancelBtn.addEventListener("click", cancel);
  });
}

function extractInstaShortcode(url) {
  const match = url.match(INSTAGRAM_REGEX);
  return match ? match[1] : null;
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

onAuthStateChanged(auth, user => {
  currentUser = user;
  isAdmin     = !!(user && user.email === ADMIN_EMAIL);
  updateAdminUI();
});

function updateAdminUI() {
  adminLoginBtn.classList.toggle("hidden", isAdmin);
  adminLogoutBtn.classList.toggle("hidden", !isAdmin);
  adminBadge.classList.toggle("hidden", !isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });
}

adminLoginBtn.addEventListener("click", () => {
  authEmail.value = "";
  authPassword.value = "";
  authError.textContent = "";
  authModal.classList.remove("hidden");
  authEmail.focus();
});

authModalClose.addEventListener("click", () => authModal.classList.add("hidden"));
authModal.addEventListener("click", e => {
  if (e.target === authModal) authModal.classList.add("hidden");
});
authPassword.addEventListener("keydown", e => {
  if (e.key === "Enter") authSubmitBtn.click();
});

authSubmitBtn.addEventListener("click", async () => {
  const email    = authEmail.value.trim();
  const password = authPassword.value;
  authError.textContent = "";
  if (!email || !password) { authError.textContent = "Email and password are required."; return; }
  setLoading(authSubmitBtn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authModal.classList.add("hidden");
    showToast("Welcome back, Admin.", "success");
  } catch (err) {
    authError.textContent = friendlyAuthError(err.code);
  } finally {
    setLoading(authSubmitBtn, false);
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  if (feedUnsubscribe) { feedUnsubscribe(); feedUnsubscribe = null; }
  Object.values(commentUnsubs).forEach(u => u());
  commentUnsubs = {};
  await signOut(auth);
  showToast("Logged out.", "info");
  initFeed();
});

function friendlyAuthError(code) {
  const map = {
    "auth/user-not-found":    "No account found with this email.",
    "auth/wrong-password":    "Incorrect password.",
    "auth/invalid-email":     "Please enter a valid email.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/invalid-credential":"Invalid email or password.",
  };
  return map[code] || "Sign-in failed. Please try again.";
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — URL TYPE TABS
// ═══════════════════════════════════════════════════════════

document.querySelectorAll(".url-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".url-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentUrlType = tab.dataset.type;
    imgUrlInput.value = "";
    urlError.textContent = "";
    imgUrlInput.classList.remove("error");

    if (currentUrlType === "instagram") {
      $("url-label").textContent     = "Instagram Post URL";
      imgUrlInput.placeholder        = "https://www.instagram.com/p/ABC123/";
      $("url-hint").textContent      = "Paste your public Instagram post link";
      thumbGroup.classList.remove("hidden");
    } else {
      $("url-label").textContent     = "Direct Image URL";
      imgUrlInput.placeholder        = "https://example.com/photo.jpg";
      $("url-hint").textContent      = "URL must end in .jpg .jpeg .png .gif .webp";
      thumbGroup.classList.add("hidden");
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — POST IMAGE
// ═══════════════════════════════════════════════════════════

imgCaptionInput.addEventListener("input", () => {
  captionCount.textContent = `${imgCaptionInput.value.length} / 150`;
});

postImageBtn.addEventListener("click", async () => {
  const url     = imgUrlInput.value.trim();
  const caption = imgCaptionInput.value.trim().slice(0, 150);
  const thumb   = imgThumbInput ? imgThumbInput.value.trim() : "";
  urlError.textContent   = "";
  if (thumbError) thumbError.textContent = "";
  imgUrlInput.classList.remove("error");

  if (!url) {
    urlError.textContent = "Please enter a URL.";
    imgUrlInput.classList.add("error");
    return;
  }

  let postType = "image";
  let finalUrl = url;
  let thumbUrl = "";

  if (currentUrlType === "instagram") {
    const shortcode = extractInstaShortcode(url);
    if (!shortcode) {
      urlError.textContent = "Please enter a valid Instagram post URL (instagram.com/p/...)";
      imgUrlInput.classList.add("error");
      return;
    }
    // Validate thumbnail
    if (!thumb) {
      if (thumbError) thumbError.textContent = "Please add a thumbnail image URL for Instagram posts.";
      imgThumbInput && imgThumbInput.classList.add("error");
      return;
    }
    if (!DIRECT_IMG_REGEX.test(thumb)) {
      if (thumbError) thumbError.textContent = "Thumbnail must end in .jpg .jpeg .png .gif .webp";
      imgThumbInput && imgThumbInput.classList.add("error");
      return;
    }
    finalUrl = `https://www.instagram.com/p/${shortcode}/`;
    thumbUrl = thumb;
    postType = "instagram";
  } else {
    if (!DIRECT_IMG_REGEX.test(url)) {
      urlError.textContent = "URL must end in .jpg, .jpeg, .png, .gif, or .webp";
      imgUrlInput.classList.add("error");
      return;
    }
    postType = "image";
    thumbUrl = url;
  }

  setLoading(postImageBtn, true);
  try {
    await addDoc(collection(db, "images"), {
      url:      finalUrl,
      thumbUrl: thumbUrl,
      type:     postType,
      caption,
      likes:    0,
      createdAt: serverTimestamp()
    });
    imgUrlInput.value    = "";
    imgCaptionInput.value= "";
    if (imgThumbInput) imgThumbInput.value = "";
    captionCount.textContent = "0 / 150";
    showToast("Post published!", "success");
    postImageBtn.classList.add("action-flash");
    setTimeout(() => postImageBtn.classList.remove("action-flash"), 600);
  } catch (err) {
    showToast("Failed to publish. Check console.", "error");
    console.error(err);
  } finally {
    setLoading(postImageBtn, false);
  }
});

imgUrlInput.addEventListener("input", () => imgUrlInput.classList.remove("error"));

// ═══════════════════════════════════════════════════════════
//  FEED — INIT & onSnapshot
// ═══════════════════════════════════════════════════════════

function initFeed() {
  if (feedUnsubscribe) feedUnsubscribe();
  imageGrid.innerHTML = "";
  lastVisibleDoc      = null;
  hasMore             = false;

  skeletonGrid.classList.remove("hidden");
  imageGrid.classList.add("hidden");
  emptyState.classList.add("hidden");
  loadMoreContainer.classList.add("hidden");

  const q = query(
    collection(db, "images"),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE)
  );

  feedUnsubscribe = onSnapshot(q, snapshot => {
    skeletonGrid.classList.add("hidden");
    imageGrid.classList.remove("hidden");

    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const card = buildCard(change.doc);
        if (!imageGrid.querySelector(`[data-id="${change.doc.id}"]`)) {
          imageGrid.prepend(card);
        }
      }
      if (change.type === "modified") updateCard(change.doc);
      if (change.type === "removed") {
        const el = imageGrid.querySelector(`[data-id="${change.doc.id}"]`);
        if (el) el.remove();
      }
    });

    const docs = snapshot.docs;
    if (docs.length === PAGE_SIZE) {
      lastVisibleDoc = docs[docs.length - 1];
      hasMore        = true;
      loadMoreContainer.classList.remove("hidden");
    } else {
      hasMore = false;
      loadMoreContainer.classList.add("hidden");
    }
    emptyState.classList.toggle("hidden", imageGrid.children.length > 0);
  }, err => {
    console.error("Feed error:", err);
    showToast("Failed to load feed.", "error");
    skeletonGrid.classList.add("hidden");
  });
}

loadMoreBtn.addEventListener("click", async () => {
  if (!lastVisibleDoc || !hasMore) return;
  setLoading(loadMoreBtn, true);
  try {
    const q = query(
      collection(db, "images"),
      orderBy("createdAt", "desc"),
      startAfter(lastVisibleDoc),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      if (!imageGrid.querySelector(`[data-id="${docSnap.id}"]`)) {
        imageGrid.appendChild(buildCard(docSnap));
      }
    });
    if (snap.docs.length === PAGE_SIZE) {
      lastVisibleDoc = snap.docs[snap.docs.length - 1];
    } else {
      hasMore = false;
      loadMoreContainer.classList.add("hidden");
    }
  } catch (err) {
    showToast("Failed to load more.", "error");
    console.error(err);
  } finally {
    setLoading(loadMoreBtn, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  CARD — BUILD & UPDATE
// ═══════════════════════════════════════════════════════════

function buildCard(docSnap) {
  const data        = docSnap.data();
  const id          = docSnap.id;
  const isInstagram = data.type === "instagram";
  // Support old posts that had no thumbUrl
  const thumbUrl    = data.thumbUrl || data.url;

  const clone = cardTemplate.content.cloneNode(true);
  const card  = clone.querySelector(".card");
  card.dataset.id   = id;
  card.dataset.type = data.type || "image";
  card.style.animationDelay = `${Math.random() * 0.12}s`;

  const img           = card.querySelector(".card-img");
  const instaOverlay  = card.querySelector(".card-insta-overlay");
  const caption       = card.querySelector(".card-caption");
  const likeBtn       = card.querySelector(".card-like-btn");
  const likeCount     = card.querySelector(".like-count");
  const timeEl        = card.querySelector(".card-time");
  const deleteBtn     = card.querySelector(".card-delete-btn");
  const commentToggle = card.querySelector(".comment-toggle-btn");
  const commentCount  = card.querySelector(".comment-count");
  const commentsSect  = card.querySelector(".comments-section");
  const submitBtn     = card.querySelector(".comment-submit-btn");
  const nameInput     = card.querySelector(".comment-name-input");
  const textInput     = card.querySelector(".comment-text-input");
  const errEl         = card.querySelector(".comment-error");
  const imgWrap       = card.querySelector(".card-img-wrap");

  // Always show the thumbnail image
  img.src = thumbUrl;
  img.alt = data.caption || "Post";

  // Show Instagram overlay badge if it's an insta post
  if (isInstagram && instaOverlay) {
    instaOverlay.classList.remove("hidden");
  }

  caption.textContent   = data.caption || "";
  likeCount.textContent = data.likes || 0;
  timeEl.textContent    = timeAgo(data.createdAt);

  // Like state
  if (localStorage.getItem(`liked_${id}`)) {
    likeBtn.classList.add("liked", "locked");
  }

  if (isAdmin) deleteBtn.classList.remove("hidden");

  // Click image — open modal or Instagram link
  imgWrap.addEventListener("click", e => {
    if (deleteBtn.contains(e.target)) return;
    if (isInstagram) {
      window.open(data.url, "_blank", "noopener");
    } else {
      openImageModal(id, data);
    }
  });

  likeBtn.addEventListener("click", () => handleLike(id, likeBtn, likeCount));

  deleteBtn.addEventListener("click", async () => {
    const ok = await showConfirm("Delete this post?", "This will permanently remove the post and all its comments.");
    if (!ok) return;
    try {
      await cascadeDeleteImage(id);
      showToast("Post deleted.", "info");
    } catch (err) {
      showToast("Failed to delete post.", "error");
      console.error(err);
    }
  });

  commentToggle.addEventListener("click", () => {
    const isExpanded = commentsSect.classList.contains("expanded");
    commentsSect.classList.toggle("expanded", !isExpanded);
    if (!isExpanded && !commentUnsubs[id]) {
      subscribeToComments(id, card.querySelector(".comments-list"), commentCount, null);
    }
  });

  submitBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    errEl.textContent = "";
    const err = validateComment(name, text);
    if (err) { errEl.textContent = err; return; }
    submitBtn.disabled = true;
    try {
      await addComment(id, name, text);
      nameInput.value = "";
      textInput.value = "";
      showToast("Comment posted!", "success");
    } catch (e) {
      errEl.textContent = "Failed to post comment.";
      console.error(e);
    } finally {
      submitBtn.disabled = false;
    }
  });

  return card;
}

function updateCard(docSnap) {
  const data = docSnap.data();
  const card = imageGrid.querySelector(`[data-id="${docSnap.id}"]`);
  if (!card) return;
  const likeCount = card.querySelector(".like-count");
  const timeEl    = card.querySelector(".card-time");
  if (likeCount) likeCount.textContent = data.likes || 0;
  if (timeEl)    timeEl.textContent    = timeAgo(data.createdAt);
}

// ═══════════════════════════════════════════════════════════
//  LIKE SYSTEM
// ═══════════════════════════════════════════════════════════

async function handleLike(imageId, btn, countEl) {
  const key = `liked_${imageId}`;
  if (localStorage.getItem(key)) return;
  btn.classList.add("liked", "locked");
  localStorage.setItem(key, "1");
  try {
    await updateDoc(doc(db, "images", imageId), { likes: increment(1) });
    countEl.textContent = parseInt(countEl.textContent || "0", 10) + 1;
  } catch (err) {
    btn.classList.remove("liked", "locked");
    localStorage.removeItem(key);
    showToast("Failed to like post.", "error");
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════
//  COMMENTS
// ═══════════════════════════════════════════════════════════

function validateComment(name, text) {
  if (!name || name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 30)         return "Name too long (max 30).";
  if (!text || text.length < 5) return "Comment must be at least 5 characters.";
  if (text.length > 200)        return "Comment too long (max 200).";
  return null;
}

async function addComment(imageId, name, text) {
  await addDoc(collection(db, "comments"), {
    imageId,
    name: name.slice(0, 30),
    text: text.slice(0, 200),
    createdAt: serverTimestamp()
  });
}

function subscribeToComments(imageId, listEl, countEl, altListEl) {
  if (commentUnsubs[imageId]) return;
  const q = query(
    collection(db, "comments"),
    where("imageId", "==", imageId),
    orderBy("createdAt", "asc")
  );
  commentUnsubs[imageId] = onSnapshot(q, snap => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCommentsList(listEl, comments, imageId);
    if (altListEl) renderCommentsList(altListEl, comments, imageId);
    if (countEl)   countEl.textContent = comments.length;
  }, err => console.error("Comments error:", err));
}

function renderCommentsList(listEl, comments, imageId) {
  if (!listEl) return;
  listEl.innerHTML = "";
  if (comments.length === 0) {
    const p = document.createElement("p");
    p.className = "no-comments";
    p.textContent = "No comments yet.";
    listEl.appendChild(p);
    return;
  }
  comments.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item";
    item.innerHTML = `
      <span class="comment-name">${sanitize(c.name)}</span>
      <span class="comment-text">${sanitize(c.text)}</span>
      <div class="comment-time">${timeAgo(c.createdAt)}</div>
      ${isAdmin ? `<button class="comment-delete-btn admin-only" data-cid="${c.id}">Delete</button>` : ""}
    `;
    if (isAdmin) {
      item.querySelector(".comment-delete-btn").addEventListener("click", async () => {
        const ok = await showConfirm("Delete comment?", "This comment will be permanently removed.");
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "comments", c.id));
          showToast("Comment removed.", "info");
        } catch (err) {
          showToast("Failed to delete comment.", "error");
          console.error(err);
        }
      });
    }
    listEl.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════
//  DELETE IMAGE (cascade)
// ═══════════════════════════════════════════════════════════

async function cascadeDeleteImage(imageId) {
  const commentsSnap = await getDocs(
    query(collection(db, "comments"), where("imageId", "==", imageId))
  );
  await Promise.all(commentsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "images", imageId));
  if (commentUnsubs[imageId]) {
    commentUnsubs[imageId]();
    delete commentUnsubs[imageId];
  }
  if (openImageId === imageId) closeImageModal();
}

// ═══════════════════════════════════════════════════════════
//  IMAGE MODAL (direct images only)
// ═══════════════════════════════════════════════════════════

async function openImageModal(imageId, data) {
  openImageId = imageId;
  const thumbUrl = data.thumbUrl || data.url;
  modalImg.src              = thumbUrl;
  modalImg.alt              = data.caption || "Post image";
  modalCaption.textContent  = data.caption || "";
  modalTime.textContent     = timeAgo(data.createdAt);
  modalCommentName.value    = "";
  modalCommentText.value    = "";
  modalNameError.textContent= "";
  modalTextError.textContent= "";

  const key = `liked_${imageId}`;
  modalLikeCount.textContent = data.likes || 0;
  if (localStorage.getItem(key)) {
    modalLikeBtn.classList.add("liked", "locked");
  } else {
    modalLikeBtn.classList.remove("liked", "locked");
  }

  subscribeToComments(imageId, modalCommentsList, null, null);
  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  document.body.style.overflow = "";
  openImageId  = null;
  modalImg.src = "";
}

imageModalClose.addEventListener("click", closeImageModal);
imageModal.addEventListener("click", e => { if (e.target === imageModal) closeImageModal(); });

modalLikeBtn.addEventListener("click", () => {
  if (!openImageId) return;
  handleLike(openImageId, modalLikeBtn, modalLikeCount);
});

modalCommentSubmit.addEventListener("click", async () => {
  const name = modalCommentName.value.trim();
  const text = modalCommentText.value.trim();
  modalNameError.textContent = "";
  modalTextError.textContent = "";
  const err = validateComment(name, text);
  if (err) {
    if (!name || name.length < 2 || name.length > 30) modalNameError.textContent = err;
    else modalTextError.textContent = err;
    return;
  }
  setLoading(modalCommentSubmit, true);
  try {
    await addComment(openImageId, name, text);
    modalCommentName.value = "";
    modalCommentText.value = "";
    showToast("Comment posted!", "success");
  } catch (err) {
    modalTextError.textContent = "Failed to post comment.";
    console.error(err);
  } finally {
    setLoading(modalCommentSubmit, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!imageModal.classList.contains("hidden"))   closeImageModal();
    if (!authModal.classList.contains("hidden"))    authModal.classList.add("hidden");
    if (!confirmModal.classList.contains("hidden")) confirmModal.classList.add("hidden");
  }
});

// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════

initFeed();
